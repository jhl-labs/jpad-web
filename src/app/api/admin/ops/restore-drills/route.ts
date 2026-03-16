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
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam || "20", 10) || 20));
    const skip = (currentPage - 1) * limit;

    const status =
      statusParam === "running" ||
      statusParam === "success" ||
      statusParam === "error"
        ? statusParam
        : undefined;

    const where: Prisma.RestoreDrillRunWhereInput = {
      ...(status ? { status } : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.restoreDrillRun.findMany({
        where,
        include: {
          backupRun: {
            select: {
              id: true,
              mode: true,
              trigger: true,
              destinationPath: true,
              startedAt: true,
            },
          },
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.restoreDrillRun.count({ where }),
    ]);

    return NextResponse.json({
      data: runs,
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

    logError("admin.ops.restore_drills.fetch_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
