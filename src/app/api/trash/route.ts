import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId required" },
        { status: 400 }
      );
    }

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50", 10) || 50));

    const where = { workspaceId, isDeleted: true };

    const [pages, total] = await Promise.all([
      prisma.page.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true,
          title: true,
          icon: true,
          deletedAt: true,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.page.count({ where }),
    ]);

    return NextResponse.json({
      pages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
