import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { checkWorkspaceAccess, requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  try {
    const user = await requireAuth();

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const statusParam = req.nextUrl.searchParams.get("status");
    const modeParam = req.nextUrl.searchParams.get("mode");
    const currentPage = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam || "20", 10) || 20));
    const skip = (currentPage - 1) * limit;

    const status =
      statusParam === "running" ||
      statusParam === "success" ||
      statusParam === "error"
        ? statusParam
        : undefined;
    const mode =
      modeParam === "dry_run" || modeParam === "execute" ? modeParam : undefined;

    const where: Prisma.RetentionRunWorkspaceWhereInput = {
      workspaceId,
      retentionRun: {
        ...(status ? { status } : {}),
        ...(mode ? { mode } : {}),
      },
    };

    const [runs, total] = await Promise.all([
      prisma.retentionRunWorkspace.findMany({
        where,
        include: {
          retentionRun: {
            select: {
              id: true,
              mode: true,
              trigger: true,
              status: true,
              startedAt: true,
              finishedAt: true,
            },
          },
        },
        orderBy: [
          { retentionRun: { startedAt: "desc" } },
          { id: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.retentionRunWorkspace.count({ where }),
    ]);

    return NextResponse.json({
      data: runs.map((entry) => ({
        id: entry.id,
        retentionRunId: entry.retentionRun.id,
        mode: entry.retentionRun.mode,
        trigger: entry.retentionRun.trigger,
        status: entry.retentionRun.status,
        startedAt: entry.retentionRun.startedAt,
        finishedAt: entry.retentionRun.finishedAt,
        summary: {
          purgedPageCount: entry.purgedPageCount,
          purgedAttachmentCount: entry.purgedAttachmentCount,
          purgedShareLinkCount: entry.purgedShareLinkCount,
          purgedAiChatCount: entry.purgedAiChatCount,
          purgedAuditLogCount: entry.purgedAuditLogCount,
        },
      })),
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: status || null,
        mode: mode || null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError("workspace.retention_runs.fetch_failed", error, { workspaceId }, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
