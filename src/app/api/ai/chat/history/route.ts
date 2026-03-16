import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";

/**
 * GET /api/ai/chat/history?workspaceId=...&pageId=...
 * pageId별 AI 채팅 히스토리를 DB(AiChat)에서 조회
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const pageId = req.nextUrl.searchParams.get("pageId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId required" },
        { status: 400 }
      );
    }

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limit = Math.min(
      200,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "100", 10) || 100)
    );

    const messages = await prisma.aiChat.findMany({
      where: {
        workspaceId,
        userId: user.id,
        ...(pageId ? { pageId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        pageId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("ai_chat_history.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
