import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";

// GET — 전체 워크스페이스 목록 조회
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();

    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 200);
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          createdAt: true,
          _count: { select: { members: true, pages: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.workspace.count({ where }),
    ]);

    return NextResponse.json({ workspaces, total });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logError("admin.workspaces.list", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
