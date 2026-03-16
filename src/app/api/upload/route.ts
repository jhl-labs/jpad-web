import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { randomUUID } from "crypto";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { getPageAccessContext } from "@/lib/pageAccess";
import { rateLimitRedis } from "@/lib/rateLimit";
import { uploadFile } from "@/lib/storage";
import { evaluateUploadSecurity } from "@/lib/uploadSecurity";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";

const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

// Magic byte signatures for server-side file type validation
const MAGIC_BYTES: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF header
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
];

function validateMagicBytes(buffer: Buffer, claimedType: string): boolean {
  // Only validate types we have signatures for; allow others (doc/docx/xls/xlsx/svg)
  const expected = MAGIC_BYTES.find(([type]) => type === claimedType);
  if (!expected) return true;
  const [, bytes] = expected;
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const pageId = formData.get("pageId") as string | null;
    const workspaceId = formData.get("workspaceId") as string | null;

    if (!file || !pageId || !workspaceId) {
      return NextResponse.json(
        { error: "file, pageId, workspaceId are required" },
        { status: 400 }
      );
    }

    // Verify workspace access (editor+)
    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify page belongs to workspace
    const pageAccess = await getPageAccessContext(user.id, pageId);
    if (!pageAccess || pageAccess.page.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    if (!pageAccess.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`upload:${user.id}:${workspaceId}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const settings = await getEffectiveWorkspaceSettings(workspaceId);
    const maxFileSize = settings.maxFileUploadMb * 1024 * 1024;

    // Validate file size
    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: `File too large (max ${settings.maxFileUploadMb}MB)` },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 }
      );
    }

    // Validate file content matches claimed MIME type
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match declared type" },
        { status: 400 }
      );
    }

    const securityResult = await evaluateUploadSecurity(
      file.name,
      file.type,
      buffer,
      {
        scanMode: settings.uploadDlpScanMode,
        detectors: settings.uploadDlpDetectors,
        maxExtractedCharacters: settings.uploadDlpMaxExtractedCharacters,
      }
    );
    if (!securityResult.allowed) {
      await recordAuditLog({
        action: "attachment.upload.blocked",
        status: securityResult.status === "error" ? "error" : "denied",
        actor: createAuditActor(user, member.role),
        workspaceId,
        pageId,
        targetType: "attachment",
        metadata: {
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          securityStatus: securityResult.status,
          securityScanner: securityResult.scanner,
          securityFindings:
            securityResult.findings as unknown as Prisma.InputJsonValue,
        },
        context: requestContext,
      });

      const errorMessage =
        securityResult.findings[0]?.message ||
        (securityResult.status === "error"
          ? "Upload security scan failed."
          : "Upload blocked by security policy.");

      return NextResponse.json(
        { error: errorMessage, security: securityResult },
        { status: securityResult.status === "error" ? 503 : 400 }
      );
    }

    // Save file via the configured storage backend.
    const uuid = randomUUID();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${uuid}-${sanitizedName}`;
    const storageKey = `${workspaceId}/${fileName}`;
    const storedFile = await uploadFile(storageKey, buffer, file.type);

    // Create Attachment record
    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        path: storedFile.path,
        storage: storedFile.storage,
        securityStatus: securityResult.status,
        securityScanner: securityResult.scanner,
        securityFindings:
          securityResult.findings as unknown as Prisma.InputJsonValue,
        securityCheckedAt: securityResult.checkedAt,
        pageId,
        userId: user.id,
      },
    });

    await recordAuditLog({
      action: "attachment.uploaded",
      actor: createAuditActor(user, member.role),
      workspaceId,
      pageId,
      targetId: attachment.id,
      targetType: "attachment",
      metadata: {
        mimeType: attachment.mimeType,
        size: attachment.size,
        storage: attachment.storage,
        securityStatus: attachment.securityStatus,
        securityScanner: attachment.securityScanner,
        securityFindings: attachment.securityFindings,
      },
      context: requestContext,
    });

    return NextResponse.json({
      url: `/api/upload/${attachment.id}`,
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      securityStatus: attachment.securityStatus,
    });
  } catch (e) {
    logError("upload.failed", e, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
