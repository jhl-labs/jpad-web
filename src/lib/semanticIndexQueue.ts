import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logger";
import { readPage } from "@/lib/git/repository";
import { removePageEmbeddings, reindexPageEmbeddings, reindexWorkspaceEmbeddings } from "@/lib/semanticSearch";

type SearchIndexJobType = "page_reindex" | "workspace_reindex";

export interface SearchIndexJobProcessEntry {
  jobId: string;
  workspaceId: string;
  pageId: string | null;
  jobType: SearchIndexJobType;
  status: "success" | "error";
  summary?: unknown;
  error?: string;
}

export interface SearchIndexJobProcessResult {
  processedCount: number;
  summaries: SearchIndexJobProcessEntry[];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function findActiveJob(input: {
  workspaceId: string;
  pageId?: string | null;
  jobType: SearchIndexJobType;
}) {
  return prisma.searchIndexJob.findFirst({
    where: {
      workspaceId: input.workspaceId,
      pageId: input.pageId || null,
      jobType: input.jobType,
      status: { in: ["pending", "running"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function enqueuePageReindexJob(input: {
  workspaceId: string;
  pageId: string;
  slug: string;
  title: string;
}) {
  const existing = await findActiveJob({
    workspaceId: input.workspaceId,
    pageId: input.pageId,
    jobType: "page_reindex",
  });
  if (existing) {
    return existing;
  }

  return prisma.searchIndexJob.create({
    data: {
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      jobType: "page_reindex",
      payload: toJsonValue({
        slug: input.slug,
        title: input.title,
      }),
    },
  });
}

export async function enqueueWorkspaceReindexJob(input: {
  workspaceId: string;
  limit?: number | null;
}) {
  const existing = await findActiveJob({
    workspaceId: input.workspaceId,
    jobType: "workspace_reindex",
  });
  if (existing) {
    return existing;
  }

  return prisma.searchIndexJob.create({
    data: {
      workspaceId: input.workspaceId,
      jobType: "workspace_reindex",
      payload: toJsonValue({
        limit: input.limit || null,
      }),
    },
  });
}

async function processPageReindexJob(job: {
  id: string;
  workspaceId: string;
  pageId: string | null;
  payload: Prisma.JsonValue | null;
}) {
  if (!job.pageId) {
    throw new Error("page_reindex job requires pageId");
  }

  const page = await prisma.page.findUnique({
    where: { id: job.pageId },
    select: {
      id: true,
      workspaceId: true,
      slug: true,
      title: true,
      isDeleted: true,
    },
  });

  if (!page || page.isDeleted) {
    await removePageEmbeddings([job.pageId]);
    return { status: "cleared" as const };
  }

  const payload =
    job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? (job.payload as { slug?: unknown; title?: unknown })
      : {};

  const slug =
    typeof payload.slug === "string" && payload.slug.trim()
      ? payload.slug
      : page.slug;
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : page.title;

  const content = await readPage(page.workspaceId, slug);
  return reindexPageEmbeddings({
    workspaceId: page.workspaceId,
    pageId: page.id,
    slug,
    title,
    content,
  });
}

async function processWorkspaceReindexJob(job: {
  workspaceId: string;
  payload: Prisma.JsonValue | null;
}) {
  const payload =
    job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? (job.payload as { limit?: unknown })
      : {};
  const limit =
    typeof payload.limit === "number" && Number.isInteger(payload.limit)
      ? payload.limit
      : undefined;

  return reindexWorkspaceEmbeddings(job.workspaceId, { limit });
}

export async function processSearchIndexJobs(options: {
  workspaceId?: string;
  limit?: number;
}): Promise<SearchIndexJobProcessResult> {
  const jobs = await prisma.searchIndexJob.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      status: { in: ["pending", "error"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(100, Math.max(1, options.limit || 10)),
  });

  const summaries: SearchIndexJobProcessEntry[] = [];

  for (const job of jobs) {
    try {
      const claimed = await prisma.searchIndexJob.updateMany({
        where: {
          id: job.id,
          status: { in: ["pending", "error"] },
        },
        data: {
          status: "running",
          attempts: { increment: 1 },
          startedAt: new Date(),
          lastError: null,
        },
      });
      if (claimed.count === 0) {
        continue;
      }

      const summary =
        job.jobType === "workspace_reindex"
          ? await processWorkspaceReindexJob(job)
          : await processPageReindexJob(job);

      await prisma.searchIndexJob.update({
        where: { id: job.id },
        data: {
          status: "success",
          processedAt: new Date(),
          summary: toJsonValue(summary),
        },
      });
      summaries.push({
        jobId: job.id,
        workspaceId: job.workspaceId,
        pageId: job.pageId,
        jobType: job.jobType as SearchIndexJobType,
        status: "success",
        summary,
      });
    } catch (error) {
      await prisma.searchIndexJob.update({
        where: { id: job.id },
        data: {
          status: "error",
          processedAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      logError("semantic.index_job.failed", error, {
        jobId: job.id,
        workspaceId: job.workspaceId,
        jobType: job.jobType,
      });
      summaries.push({
        jobId: job.id,
        workspaceId: job.workspaceId,
        pageId: job.pageId,
        jobType: job.jobType as SearchIndexJobType,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processedCount: summaries.length,
    summaries,
  };
}

export async function triggerBestEffortSearchIndexProcessing(workspaceId: string) {
  void processSearchIndexJobs({ workspaceId, limit: 1 })
    .then((result) => {
      if (result.processedCount > 0) {
        logInfo("semantic.index_job.best_effort_processed", {
          workspaceId,
          processedCount: result.processedCount,
        });
      }
    })
    .catch((error) => {
      logError("semantic.index_job.best_effort_failed", error, { workspaceId });
    });
}
