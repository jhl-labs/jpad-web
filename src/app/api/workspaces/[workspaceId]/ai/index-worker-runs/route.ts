import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  try {
    const user = await requireAuth();
    const member = await checkWorkspaceAccess(user.id, workspaceId, ["owner", "admin"]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limitParam = req.nextUrl.searchParams.get("limit");
    const statusParam = req.nextUrl.searchParams.get("status");
    const limit = Math.min(20, Math.max(1, Number.parseInt(limitParam || "6", 10) || 6));
    const status =
      statusParam === "running" || statusParam === "success" || statusParam === "error"
        ? statusParam
        : undefined;

    const where: Prisma.SearchIndexWorkerRunWorkspaceWhereInput = {
      workspaceId,
      searchIndexWorkerRun: {
        ...(status ? { status } : {}),
      },
    };

    const runs = await prisma.searchIndexWorkerRunWorkspace.findMany({
      where,
      include: {
        searchIndexWorkerRun: {
          select: {
            id: true,
            trigger: true,
            status: true,
            workspaceScopeId: true,
            limit: true,
            summary: true,
            errorMessage: true,
            startedAt: true,
            finishedAt: true,
          },
        },
      },
      orderBy: [{ searchIndexWorkerRun: { startedAt: "desc" } }, { id: "desc" }],
      take: limit,
    });

    return NextResponse.json({
      data: runs.map((entry) => ({
        id: entry.id,
        searchIndexWorkerRunId: entry.searchIndexWorkerRun.id,
        trigger: entry.searchIndexWorkerRun.trigger,
        status: entry.searchIndexWorkerRun.status,
        workspaceScopeId: entry.searchIndexWorkerRun.workspaceScopeId,
        limit: entry.searchIndexWorkerRun.limit,
        startedAt: entry.searchIndexWorkerRun.startedAt,
        finishedAt: entry.searchIndexWorkerRun.finishedAt,
        errorMessage: entry.searchIndexWorkerRun.errorMessage,
        runSummary: entry.searchIndexWorkerRun.summary,
        summary: {
          processedJobCount: entry.processedJobCount,
          successJobCount: entry.successJobCount,
          errorJobCount: entry.errorJobCount,
          pageReindexJobCount: entry.pageReindexJobCount,
          workspaceReindexJobCount: entry.workspaceReindexJobCount,
        },
      })),
      filters: {
        status: status || null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError("workspace.ai.index_worker_runs.fetch_failed", error, { workspaceId }, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
