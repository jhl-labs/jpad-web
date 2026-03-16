import { Prisma } from "@prisma/client";
import { recordAuditLog, type AuditActor } from "@/lib/audit";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  processSearchIndexJobs,
  type SearchIndexJobProcessEntry,
  type SearchIndexJobProcessResult,
} from "@/lib/semanticIndexQueue";
import type { RequestContext } from "@/lib/requestContext";

export interface SearchIndexWorkerWorkspaceSummary {
  workspaceId: string;
  processedJobCount: number;
  successJobCount: number;
  errorJobCount: number;
  pageReindexJobCount: number;
  workspaceReindexJobCount: number;
}

export interface SearchIndexWorkerRunSummary {
  processedJobCount: number;
  successJobCount: number;
  errorJobCount: number;
  workspaceCount: number;
  pageReindexJobCount: number;
  workspaceReindexJobCount: number;
}

export interface TrackedSearchIndexWorkerResult {
  runId: string;
  trigger: string;
  scopeWorkspaceId: string | null;
  limit: number | null;
  summary: SearchIndexWorkerRunSummary;
  workspaceSummary: SearchIndexWorkerWorkspaceSummary[];
  result: SearchIndexJobProcessResult;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createWorkspaceSummary(workspaceId: string): SearchIndexWorkerWorkspaceSummary {
  return {
    workspaceId,
    processedJobCount: 0,
    successJobCount: 0,
    errorJobCount: 0,
    pageReindexJobCount: 0,
    workspaceReindexJobCount: 0,
  };
}

function aggregateWorkspaceSummary(
  entries: SearchIndexJobProcessEntry[],
  scopeWorkspaceId?: string
) {
  const workspaceSummaryMap = new Map<string, SearchIndexWorkerWorkspaceSummary>();

  for (const entry of entries) {
    const current =
      workspaceSummaryMap.get(entry.workspaceId) || createWorkspaceSummary(entry.workspaceId);
    current.processedJobCount += 1;
    if (entry.status === "success") {
      current.successJobCount += 1;
    } else {
      current.errorJobCount += 1;
    }

    if (entry.jobType === "workspace_reindex") {
      current.workspaceReindexJobCount += 1;
    } else {
      current.pageReindexJobCount += 1;
    }

    workspaceSummaryMap.set(entry.workspaceId, current);
  }

  if (scopeWorkspaceId && !workspaceSummaryMap.has(scopeWorkspaceId)) {
    workspaceSummaryMap.set(scopeWorkspaceId, createWorkspaceSummary(scopeWorkspaceId));
  }

  return [...workspaceSummaryMap.values()].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
}

function aggregateRunSummary(
  workspaceSummary: SearchIndexWorkerWorkspaceSummary[]
): SearchIndexWorkerRunSummary {
  return workspaceSummary.reduce<SearchIndexWorkerRunSummary>(
    (acc, entry) => {
      acc.processedJobCount += entry.processedJobCount;
      acc.successJobCount += entry.successJobCount;
      acc.errorJobCount += entry.errorJobCount;
      acc.pageReindexJobCount += entry.pageReindexJobCount;
      acc.workspaceReindexJobCount += entry.workspaceReindexJobCount;
      return acc;
    },
    {
      processedJobCount: 0,
      successJobCount: 0,
      errorJobCount: 0,
      workspaceCount: workspaceSummary.length,
      pageReindexJobCount: 0,
      workspaceReindexJobCount: 0,
    }
  );
}

export async function runTrackedSearchIndexWorker(input: {
  workspaceId?: string;
  limit?: number;
  trigger?: string;
  actor?: AuditActor | null;
  context?: RequestContext | null;
}): Promise<TrackedSearchIndexWorkerResult> {
  const trigger = input.trigger || "manual";
  const limit = input.limit ?? null;
  const run = await prisma.searchIndexWorkerRun.create({
    data: {
      trigger,
      workspaceScopeId: input.workspaceId || null,
      limit,
    },
    select: { id: true },
  });

  logInfo("semantic.index_worker.started", {
    searchIndexWorkerRunId: run.id,
    trigger,
    workspaceScopeId: input.workspaceId || null,
    limit,
  });

  try {
    const result = await processSearchIndexJobs({
      workspaceId: input.workspaceId,
      limit: input.limit,
    });
    const workspaceSummary = aggregateWorkspaceSummary(result.summaries, input.workspaceId);
    const summary = aggregateRunSummary(workspaceSummary);

    await prisma.$transaction(async (tx) => {
      if (workspaceSummary.length > 0) {
        await tx.searchIndexWorkerRunWorkspace.createMany({
          data: workspaceSummary.map((entry) => ({
            searchIndexWorkerRunId: run.id,
            workspaceId: entry.workspaceId,
            processedJobCount: entry.processedJobCount,
            successJobCount: entry.successJobCount,
            errorJobCount: entry.errorJobCount,
            pageReindexJobCount: entry.pageReindexJobCount,
            workspaceReindexJobCount: entry.workspaceReindexJobCount,
          })),
          skipDuplicates: true,
        });
      }

      await tx.searchIndexWorkerRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          summary: toJsonValue(summary),
          finishedAt: new Date(),
        },
      });
    });

    await Promise.all(
      workspaceSummary
        .filter((entry) => input.workspaceId === entry.workspaceId || entry.processedJobCount > 0)
        .map((entry) =>
          recordAuditLog({
            action: "search.index_worker.executed",
            actor: input.actor ?? null,
            workspaceId: entry.workspaceId,
            targetId: run.id,
            targetType: "search_index_worker_run",
            metadata: toJsonValue({
              trigger,
              limit,
              summary: entry,
              runSummary: summary,
            }),
            context: input.context ?? null,
          })
        )
    );

    logInfo("semantic.index_worker.completed", {
      searchIndexWorkerRunId: run.id,
      trigger,
      workspaceScopeId: input.workspaceId || null,
      summary,
    });

    return {
      runId: run.id,
      trigger,
      scopeWorkspaceId: input.workspaceId || null,
      limit,
      summary,
      workspaceSummary,
      result,
    };
  } catch (error) {
    await prisma.searchIndexWorkerRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });
    logError("semantic.index_worker.failed", error, {
      searchIndexWorkerRunId: run.id,
      trigger,
      workspaceScopeId: input.workspaceId || null,
      limit,
    });
    throw error;
  }
}
