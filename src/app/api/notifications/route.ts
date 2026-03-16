import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const cursor = req.nextUrl.searchParams.get("cursor");

    const limit = Math.min(100, Math.max(1, parseInt(limitParam || "20") || 20));

    const where: Record<string, unknown> = { userId: user.id };
    if (unreadOnly) {
      where.read = false;
    }
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const findArgs: Record<string, unknown> = {
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    };

    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1;
    }

    const notifications = await prisma.notification.findMany(
      findArgs as Parameters<typeof prisma.notification.findMany>[0]
    );

    let nextCursor: string | null = null;
    if (notifications.length > limit) {
      const next = notifications.pop();
      nextCursor = next!.id;
    }

    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        read: false,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    return NextResponse.json({
      data: notifications,
      nextCursor,
      unreadCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("notifications.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
