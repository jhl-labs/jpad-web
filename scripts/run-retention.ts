import { Prisma } from "@prisma/client";
import { logError, logInfo } from "../src/lib/logger";
import { recordAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";
import { permanentlyDeletePageSubtree } from "../src/lib/pageLifecycle";
import {
  getRetentionConfig,
  subtractDays,
  type RetentionSummary,
  type WorkspaceRetentionSummary,
} from "../src/lib/retention";

let retentionRunId: string | null = null;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function createWorkspaceAccumulator() {
  return {
    purgedPageCount: 0,
    purgedAttachmentCount: 0,
    purgedShareLinkCount: 0,
    purgedAiChatCount: 0,
    purgedAuditLogCount: 0,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const trigger = readFlag("--trigger") || process.env.RETENTION_TRIGGER || "manual";
  const now = new Date();
  const config = getRetentionConfig();
  const run = await prisma.retentionRun.create({
    data: {
      mode: dryRun ? "dry_run" : "execute",
      trigger,
      config: toJsonValue(config),
    },
    select: { id: true },
  });
  retentionRunId = run.id;

  const trashCutoff = subtractDays(now, config.trashRetentionDays);
  const aiChatCutoff = subtractDays(now, config.aiChatRetentionDays);
  const revokedShareCutoff = subtractDays(now, config.revokedShareRetentionDays);
  const auditLogCutoff = subtractDays(now, config.auditLogRetentionDays);

  logInfo("retention.run.started", {
    retentionRunId: run.id,
    mode: dryRun ? "dry_run" : "execute",
    trigger,
    config,
  });

  const deletedPages = await prisma.page.findMany({
    where: {
      isDeleted: true,
      deletedAt: { lte: trashCutoff },
    },
    select: {
      id: true,
      parentId: true,
      workspaceId: true,
    },
  });

  const deletedPageIds = new Set(deletedPages.map((page) => page.id));
  const purgeRoots = deletedPages.filter(
    (page) => !page.parentId || !deletedPageIds.has(page.parentId)
  );

  const workspaceSummaryMap = new Map<
    string,
    Omit<WorkspaceRetentionSummary, "workspaceId">
  >();
  const summary: RetentionSummary = {
    purgedPageCount: 0,
    purgedAttachmentCount: 0,
    purgedShareLinkCount: 0,
    purgedAiChatCount: 0,
    purgedAuditLogCount: 0,
  };

  for (const page of purgeRoots) {
    const result = await permanentlyDeletePageSubtree(page.workspaceId, page.id, {
      actorName: "Retention job",
      dryRun,
    });
    summary.purgedPageCount += result.deletedCount;
    summary.purgedAttachmentCount += result.attachmentCount;

    const workspaceSummary =
      workspaceSummaryMap.get(page.workspaceId) || createWorkspaceAccumulator();
    workspaceSummary.purgedPageCount += result.deletedCount;
    workspaceSummary.purgedAttachmentCount += result.attachmentCount;
    workspaceSummaryMap.set(page.workspaceId, workspaceSummary);
  }

  const shareLinksToPurge = await prisma.pageShareLink.findMany({
    where: {
      OR: [
        { revokedAt: { lte: revokedShareCutoff } },
        { expiresAt: { lte: revokedShareCutoff } },
      ],
    },
    select: {
      id: true,
      page: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  for (const shareLink of shareLinksToPurge) {
    const workspaceSummary =
      workspaceSummaryMap.get(shareLink.page.workspaceId) || createWorkspaceAccumulator();
    workspaceSummary.purgedShareLinkCount += 1;
    workspaceSummaryMap.set(shareLink.page.workspaceId, workspaceSummary);
  }

  const revokedShareWhere = {
    OR: [
      { revokedAt: { lte: revokedShareCutoff } },
      { expiresAt: { lte: revokedShareCutoff } },
    ],
  };

  summary.purgedShareLinkCount = dryRun
    ? await prisma.pageShareLink.count({ where: revokedShareWhere })
    : (await prisma.pageShareLink.deleteMany({ where: revokedShareWhere })).count;

  const aiChatsToPurge = await prisma.aiChat.groupBy({
    by: ["workspaceId"],
    where: { createdAt: { lte: aiChatCutoff } },
    _count: { _all: true },
  });

  for (const entry of aiChatsToPurge) {
    const workspaceSummary =
      workspaceSummaryMap.get(entry.workspaceId) || createWorkspaceAccumulator();
    workspaceSummary.purgedAiChatCount += entry._count._all;
    workspaceSummaryMap.set(entry.workspaceId, workspaceSummary);
  }

  summary.purgedAiChatCount = dryRun
    ? await prisma.aiChat.count({
        where: { createdAt: { lte: aiChatCutoff } },
      })
    : (await prisma.aiChat.deleteMany({
        where: { createdAt: { lte: aiChatCutoff } },
      })).count;

  const auditLogsToPurge = await prisma.auditLog.groupBy({
    by: ["workspaceId"],
    where: {
      createdAt: { lte: auditLogCutoff },
      workspaceId: { not: null },
    },
    _count: { _all: true },
  });

  for (const entry of auditLogsToPurge) {
    if (!entry.workspaceId) {
      continue;
    }

    const workspaceSummary =
      workspaceSummaryMap.get(entry.workspaceId) || createWorkspaceAccumulator();
    workspaceSummary.purgedAuditLogCount += entry._count._all;
    workspaceSummaryMap.set(entry.workspaceId, workspaceSummary);
  }

  summary.purgedAuditLogCount = dryRun
    ? await prisma.auditLog.count({
        where: { createdAt: { lte: auditLogCutoff } },
      })
    : (await prisma.auditLog.deleteMany({
        where: { createdAt: { lte: auditLogCutoff } },
      })).count;

  const workspaceSummary: WorkspaceRetentionSummary[] = [...workspaceSummaryMap.entries()]
    .map(([workspaceId, value]) => ({
      workspaceId,
      ...value,
    }))
    .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));

  if (!dryRun) {
    await Promise.all(
      workspaceSummary
        .filter(
          (entry) =>
            entry.purgedPageCount > 0 ||
            entry.purgedAttachmentCount > 0 ||
            entry.purgedShareLinkCount > 0 ||
            entry.purgedAiChatCount > 0 ||
            entry.purgedAuditLogCount > 0
        )
        .map((entry) =>
          recordAuditLog({
            action: "retention.executed",
            workspaceId: entry.workspaceId,
            targetId: run.id,
            targetType: "retention_run",
            metadata: toJsonValue({
              trigger,
              mode: "execute",
              summary: entry,
            }),
          })
        )
    );
  }

  await prisma.$transaction(async (tx) => {
    if (workspaceSummary.length > 0) {
      await tx.retentionRunWorkspace.createMany({
        data: workspaceSummary.map((entry) => ({
          retentionRunId: run.id,
          workspaceId: entry.workspaceId,
          purgedPageCount: entry.purgedPageCount,
          purgedAttachmentCount: entry.purgedAttachmentCount,
          purgedShareLinkCount: entry.purgedShareLinkCount,
          purgedAiChatCount: entry.purgedAiChatCount,
          purgedAuditLogCount: entry.purgedAuditLogCount,
        })),
        skipDuplicates: true,
      });
    }

    await tx.retentionRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        summary: toJsonValue(summary),
        workspaceSummary: toJsonValue(workspaceSummary),
        finishedAt: new Date(),
      },
    });
  });

  logInfo("retention.run.completed", {
    retentionRunId: run.id,
    mode: dryRun ? "dry_run" : "execute",
    trigger,
    summary,
    workspaceSummaryCount: workspaceSummary.length,
  });

  console.log(
    JSON.stringify(
      {
        retentionRunId: run.id,
        dryRun,
        trigger,
        config,
        summary,
        workspaceSummary,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    logError("retention.run.failed", error);
    if (retentionRunId) {
      prisma.retentionRun
        .update({
          where: { id: retentionRunId },
          data: {
            status: "error",
            errorMessage: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
          },
        })
        .catch(() => {
          // Ignore secondary persistence failure.
        });
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
