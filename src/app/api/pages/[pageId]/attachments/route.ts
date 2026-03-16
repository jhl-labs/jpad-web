import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { getPageAccessContext } from "@/lib/pageAccess";
import { deleteFile } from "@/lib/storage";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const attachments = await prisma.attachment.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        securityStatus: true,
        securityDisposition: true,
        securityScanner: true,
        securityReviewedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(attachments);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("attachments.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`attachment-delete:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { pageId } = await params;
    const requestContext = getAuditRequestContext(req);
    const { attachmentId } = await req.json();

    if (!attachmentId) {
      return NextResponse.json(
        { error: "attachmentId is required" },
        { status: 400 }
      );
    }

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.pageId !== pageId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete DB record first (can be rolled back if it fails)
    await prisma.attachment.delete({ where: { id: attachmentId } });

    // Delete file from disk (DB already committed, orphan file is acceptable)
    await deleteFile(attachment.path, attachment.storage).catch(() => {
      // File may already be deleted.
    });

    await recordAuditLog({
      action: "attachment.deleted",
      actor: createAuditActor(user, access.member?.role ?? null),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: attachmentId,
      targetType: "attachment",
      metadata: {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        securityStatus: attachment.securityStatus,
        securityDisposition: attachment.securityDisposition,
        securityScanner: attachment.securityScanner,
        securityReviewedAt: attachment.securityReviewedAt,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("attachments.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
