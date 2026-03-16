import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();

    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const statusParam = req.nextUrl.searchParams.get("status");
    const currentPage = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam || "10", 10) || 10));
    const skip = (currentPage - 1) * limit;

    const status =
      statusParam === "running" || statusParam === "success" || statusParam === "error"
        ? statusParam
        : undefined;

    const where: Prisma.SearchIndexWorkerRunWhereInput = {
      ...(status ? { status } : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.searchIndexWorkerRun.findMany({
        where,
        include: {
          workspaceRuns: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 10,
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.searchIndexWorkerRun.count({ where }),
    ]);

    return NextResponse.json({
      data: runs.map((run) => ({
        id: run.id,
        trigger: run.trigger,
        status: run.status,
        workspaceScopeId: run.workspaceScopeId,
        limit: run.limit,
        summary: run.summary,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        workspaceRuns: run.workspaceRuns.map((entry) => ({
          id: entry.id,
          workspaceId: entry.workspaceId,
          workspaceName: entry.workspace.name,
          workspaceSlug: entry.workspace.slug,
          processedJobCount: entry.processedJobCount,
          successJobCount: entry.successJobCount,
          errorJobCount: entry.errorJobCount,
          pageReindexJobCount: entry.pageReindexJobCount,
          workspaceReindexJobCount: entry.workspaceReindexJobCount,
        })),
      })),
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: status || null,
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

    logError("admin.ops.index_workers.fetch_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
