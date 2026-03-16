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

    const where: Prisma.BackupRunWhereInput = {
      ...(status ? { status } : {}),
      ...(mode ? { mode } : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.backupRun.findMany({
        where,
        include: {
          artifacts: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          restoreDrills: {
            orderBy: [{ startedAt: "desc" }, { id: "desc" }],
            take: 1,
          },
          _count: {
            select: {
              artifacts: true,
              restoreDrills: true,
            },
          },
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.backupRun.count({ where }),
    ]);

    return NextResponse.json({
      data: runs.map((run) => ({
        id: run.id,
        mode: run.mode,
        trigger: run.trigger,
        status: run.status,
        backupRootDir: run.backupRootDir,
        destinationPath: run.destinationPath,
        summary: run.summary,
        manifest: run.manifest,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        artifactCount: run._count.artifacts,
        restoreDrillCount: run._count.restoreDrills,
        artifacts: run.artifacts,
        latestRestoreDrill: run.restoreDrills[0] || null,
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
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    logError("admin.ops.backups.fetch_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
