import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { getAuditWebhookRuntimeStatus } from "@/lib/auditWebhook";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getUploadSecurityRuntimeStatus } from "@/lib/uploadSecurity";
import { getVectorStoreRuntimeStatus } from "@/lib/vectorStore";

export async function GET() {
  try {
    const user = await requirePlatformAdmin();

    const [
      latestSuccessfulBackup,
      latestSuccessfulRestoreDrill,
      latestSuccessfulIndexWorker,
      runningBackupCount,
      failedBackupCount,
      runningRestoreDrillCount,
      failedRestoreDrillCount,
      runningIndexWorkerCount,
      failedIndexWorkerCount,
      quarantinedAttachmentCount,
      releasedAttachmentCount,
      warningAttachmentCount,
      latestAttachmentReview,
      auditWebhookStatus,
      uploadSecurityStatus,
      vectorStoreStatus,
    ] = await Promise.all([
      prisma.backupRun.findFirst({
        where: { status: "success", mode: "execute" },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          mode: true,
          trigger: true,
          status: true,
          destinationPath: true,
          startedAt: true,
          finishedAt: true,
          summary: true,
        },
      }),
      prisma.restoreDrillRun.findFirst({
        where: { status: "success" },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          backupRunId: true,
          trigger: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          summary: true,
        },
      }),
      prisma.searchIndexWorkerRun.findFirst({
        where: { status: "success" },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          trigger: true,
          status: true,
          workspaceScopeId: true,
          limit: true,
          startedAt: true,
          finishedAt: true,
          summary: true,
        },
      }),
      prisma.backupRun.count({ where: { status: "running" } }),
      prisma.backupRun.count({ where: { status: "error" } }),
      prisma.restoreDrillRun.count({ where: { status: "running" } }),
      prisma.restoreDrillRun.count({ where: { status: "error" } }),
      prisma.searchIndexWorkerRun.count({ where: { status: "running" } }),
      prisma.searchIndexWorkerRun.count({ where: { status: "error" } }),
      prisma.attachment.count({
        where: {
          securityStatus: "blocked",
          OR: [
            {
              securityDisposition: null,
            },
            {
              securityDisposition: "blocked",
            },
          ],
        },
      }),
      prisma.attachment.count({
        where: {
          securityStatus: "blocked",
          securityDisposition: "released",
        },
      }),
      prisma.attachment.count({
        where: {
          securityStatus: {
            in: ["error", "bypassed", "not_scanned"],
          },
        },
      }),
      prisma.attachment.findFirst({
        where: {
          securityReviewedAt: {
            not: null,
          },
        },
        orderBy: [{ securityReviewedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          filename: true,
          securityDisposition: true,
          securityReviewedAt: true,
          page: {
            select: {
              workspaceId: true,
            },
          },
        },
      }),
      getAuditWebhookRuntimeStatus(),
      Promise.resolve(getUploadSecurityRuntimeStatus()),
      getVectorStoreRuntimeStatus(),
    ]);

    return NextResponse.json({
      currentUser: {
        email: user.email,
        name: user.name,
      },
      summary: {
        latestSuccessfulBackup,
        latestSuccessfulRestoreDrill,
        latestSuccessfulIndexWorker,
        runningBackupCount,
        failedBackupCount,
        runningRestoreDrillCount,
        failedRestoreDrillCount,
        runningIndexWorkerCount,
        failedIndexWorkerCount,
        attachmentSecurityQueue: {
          quarantinedCount: quarantinedAttachmentCount,
          releasedCount: releasedAttachmentCount,
          warningCount: warningAttachmentCount,
          latestReview: latestAttachmentReview
            ? {
                id: latestAttachmentReview.id,
                filename: latestAttachmentReview.filename,
                workspaceId: latestAttachmentReview.page.workspaceId,
                disposition: latestAttachmentReview.securityDisposition,
                reviewedAt: latestAttachmentReview.securityReviewedAt,
              }
            : null,
        },
        auditWebhookStatus,
        uploadSecurityStatus,
        vectorStoreStatus,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    logError("admin.ops.overview.fetch_failed", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
