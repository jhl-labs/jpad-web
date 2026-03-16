import { Prisma } from "@prisma/client";
import {
  createAuditActor,
  getAuditRequestContext,
  recordAuditLog,
  type AuditActor,
} from "@/lib/audit";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";
import { evaluateUploadSecurity, type UploadSecurityFinding } from "@/lib/uploadSecurity";
import type { RequestContext } from "@/lib/requestContext";

export interface AttachmentSecurityRescanResult {
  attachmentId: string;
  pageId: string;
  workspaceId: string;
  previousStatus: string;
  nextStatus: string;
  previousDisposition: string | null;
  nextDisposition: string | null;
  scanner: string | null;
  findings: UploadSecurityFinding[];
  checkedAt: string | null;
  quarantined: boolean;
}

export interface AttachmentSecurityDispositionResult {
  attachmentId: string;
  pageId: string;
  workspaceId: string;
  securityStatus: string;
  securityDisposition: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
}

interface RescanAuditOptions {
  actor?: AuditActor | null;
  context?: RequestContext | null;
}

export function isAttachmentQuarantined(
  securityStatus?: string | null,
  securityDisposition?: string | null
) {
  return securityStatus === "blocked" && securityDisposition !== "released";
}

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

async function updateAttachmentSecurity(
  attachmentId: string,
  status: string,
  scanner: string | null,
  findings: UploadSecurityFinding[],
  checkedAt: Date | null
) {
  return prisma.attachment.update({
    where: { id: attachmentId },
    data: {
      securityStatus: status,
      securityDisposition: null,
      securityScanner: scanner,
      securityFindings: toJsonValue(findings),
      securityCheckedAt: checkedAt,
      securityReviewedAt: null,
      securityReviewedByUserId: null,
      securityReviewNote: null,
    },
  });
}

export async function rescanAttachmentById(
  attachmentId: string,
  audit: RescanAuditOptions = {}
): Promise<AttachmentSecurityRescanResult> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      path: true,
      storage: true,
      securityStatus: true,
      securityDisposition: true,
      pageId: true,
      page: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new Error("Attachment not found");
  }

  const file = await getFile(attachment.path, attachment.storage || "local");
  const previousStatus = attachment.securityStatus;
  const previousDisposition = attachment.securityDisposition;

  if (!file) {
    const finding: UploadSecurityFinding = {
      code: "file_missing",
      category: "scanner",
      severity: "high",
      message: "Stored attachment file could not be read for rescan.",
    };
    const checkedAt = new Date();

    await updateAttachmentSecurity(
      attachment.id,
      "error",
      "storage",
      [finding],
      checkedAt
    );

    await recordAuditLog({
      action: "attachment.security.rescanned",
      actor: audit.actor ?? null,
      workspaceId: attachment.page.workspaceId,
      pageId: attachment.pageId,
      targetId: attachment.id,
      targetType: "attachment",
      status: "error",
      metadata: {
        previousStatus,
        previousDisposition,
        nextStatus: "error",
        nextDisposition: null,
        scanner: "storage",
        findings: toJsonValue([finding]),
      },
      context: audit.context ?? null,
    });

    return {
      attachmentId: attachment.id,
      pageId: attachment.pageId,
      workspaceId: attachment.page.workspaceId,
      previousStatus,
      nextStatus: "error",
      previousDisposition,
      nextDisposition: null,
      scanner: "storage",
      findings: [finding],
      checkedAt: checkedAt.toISOString(),
      quarantined: false,
    };
  }

  const securityResult = await evaluateUploadSecurity(
    attachment.filename,
    attachment.mimeType,
    file.data
  );

  await updateAttachmentSecurity(
    attachment.id,
    securityResult.status,
    securityResult.scanner,
    securityResult.findings,
    securityResult.checkedAt
  );

  await recordAuditLog({
    action: "attachment.security.rescanned",
    actor: audit.actor ?? null,
    workspaceId: attachment.page.workspaceId,
    pageId: attachment.pageId,
    targetId: attachment.id,
    targetType: "attachment",
    metadata: {
      previousStatus,
      previousDisposition,
      nextStatus: securityResult.status,
      nextDisposition: null,
      scanner: securityResult.scanner,
      findings: toJsonValue(securityResult.findings),
      quarantined: securityResult.status === "blocked",
    },
    context: audit.context ?? null,
  });

  if (
    securityResult.status === "blocked" &&
    (previousStatus !== "blocked" || previousDisposition === "released")
  ) {
    await recordAuditLog({
      action: "attachment.quarantined",
      actor: audit.actor ?? null,
      workspaceId: attachment.page.workspaceId,
      pageId: attachment.pageId,
      targetId: attachment.id,
      targetType: "attachment",
      metadata: {
        previousStatus,
        previousDisposition,
        nextStatus: securityResult.status,
        nextDisposition: null,
        scanner: securityResult.scanner,
        findings: toJsonValue(securityResult.findings),
      },
      context: audit.context ?? null,
    });
  }

  return {
    attachmentId: attachment.id,
    pageId: attachment.pageId,
      workspaceId: attachment.page.workspaceId,
      previousStatus,
      nextStatus: securityResult.status,
      previousDisposition,
      nextDisposition: null,
      scanner: securityResult.scanner,
      findings: securityResult.findings,
      checkedAt: securityResult.checkedAt?.toISOString() || null,
      quarantined: securityResult.status === "blocked",
    };
}

export async function runAttachmentSecurityRescanBatch(options: {
  limit: number;
  workspaceId?: string;
}) {
  const attachments = await prisma.attachment.findMany({
    where: {
      securityStatus: {
        in: ["error", "bypassed", "not_scanned"],
      },
      ...(options.workspaceId
        ? {
            page: {
              workspaceId: options.workspaceId,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: options.limit,
    select: { id: true },
  });

  const results: AttachmentSecurityRescanResult[] = [];
  for (const attachment of attachments) {
    try {
      const result = await rescanAttachmentById(attachment.id);
      results.push(result);
    } catch (error) {
      logError("attachment.security.batch_rescan_failed", error, {
        attachmentId: attachment.id,
      });
    }
  }

  return {
    processedCount: results.length,
    quarantinedCount: results.filter((result) => result.quarantined).length,
    cleanCount: results.filter((result) => result.nextStatus === "clean").length,
    errorCount: results.filter((result) => result.nextStatus === "error").length,
    results,
  };
}

export async function releaseAttachmentQuarantineById(
  attachmentId: string,
  audit: RescanAuditOptions & { note?: string | null }
): Promise<AttachmentSecurityDispositionResult> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      securityStatus: true,
      securityDisposition: true,
      pageId: true,
      page: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new Error("Attachment not found");
  }

  if (attachment.securityStatus !== "blocked") {
    throw new Error("Attachment is not quarantined");
  }

  const reviewedAt = new Date();
  const updated = await prisma.attachment.update({
    where: { id: attachment.id },
    data: {
      securityDisposition: "released",
      securityReviewedAt: reviewedAt,
      securityReviewedByUserId: audit.actor?.id ?? null,
      securityReviewNote: audit.note?.trim() || null,
    },
    select: {
      id: true,
      securityStatus: true,
      securityDisposition: true,
      securityReviewedAt: true,
      securityReviewedByUserId: true,
      securityReviewNote: true,
    },
  });

  await recordAuditLog({
    action: "attachment.quarantine.released",
    actor: audit.actor ?? null,
    workspaceId: attachment.page.workspaceId,
    pageId: attachment.pageId,
    targetId: attachment.id,
    targetType: "attachment",
    metadata: {
      previousDisposition: attachment.securityDisposition,
      nextDisposition: "released",
      securityStatus: attachment.securityStatus,
      note: audit.note?.trim() || null,
    },
    context: audit.context ?? null,
  });

  return {
    attachmentId: updated.id,
    pageId: attachment.pageId,
    workspaceId: attachment.page.workspaceId,
    securityStatus: updated.securityStatus,
    securityDisposition: updated.securityDisposition,
    reviewedAt: updated.securityReviewedAt?.toISOString() || null,
    reviewedByUserId: updated.securityReviewedByUserId,
    reviewNote: updated.securityReviewNote,
  };
}

export async function reblockAttachmentQuarantineById(
  attachmentId: string,
  audit: RescanAuditOptions & { note?: string | null }
): Promise<AttachmentSecurityDispositionResult> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      securityStatus: true,
      securityDisposition: true,
      pageId: true,
      page: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new Error("Attachment not found");
  }

  if (attachment.securityStatus !== "blocked") {
    throw new Error("Attachment is not quarantined");
  }

  const reviewedAt = new Date();
  const updated = await prisma.attachment.update({
    where: { id: attachment.id },
    data: {
      securityDisposition: "blocked",
      securityReviewedAt: reviewedAt,
      securityReviewedByUserId: audit.actor?.id ?? null,
      securityReviewNote: audit.note?.trim() || null,
    },
    select: {
      id: true,
      securityStatus: true,
      securityDisposition: true,
      securityReviewedAt: true,
      securityReviewedByUserId: true,
      securityReviewNote: true,
    },
  });

  await recordAuditLog({
    action: "attachment.quarantine.reblocked",
    actor: audit.actor ?? null,
    workspaceId: attachment.page.workspaceId,
    pageId: attachment.pageId,
    targetId: attachment.id,
    targetType: "attachment",
    metadata: {
      previousDisposition: attachment.securityDisposition,
      nextDisposition: "blocked",
      securityStatus: attachment.securityStatus,
      note: audit.note?.trim() || null,
    },
    context: audit.context ?? null,
  });

  return {
    attachmentId: updated.id,
    pageId: attachment.pageId,
    workspaceId: attachment.page.workspaceId,
    securityStatus: updated.securityStatus,
    securityDisposition: updated.securityDisposition,
    reviewedAt: updated.securityReviewedAt?.toISOString() || null,
    reviewedByUserId: updated.securityReviewedByUserId,
    reviewNote: updated.securityReviewNote,
  };
}

export function createAttachmentSecurityAuditActor(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}, role?: string | null) {
  return createAuditActor(user, role);
}

export { getAuditRequestContext };
