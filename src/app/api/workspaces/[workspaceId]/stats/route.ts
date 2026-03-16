import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";

/**
 * GET /api/workspaces/[workspaceId]/stats
 * 워크스페이스 통계: 페이지 수, 멤버 수, 첨부파일 수, 총 저장 용량, 할 일 수, 캘린더 이벤트 수
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [
      pageCount,
      memberCount,
      attachmentCount,
      storageAgg,
      todoCount,
      calendarEventCount,
    ] = await Promise.all([
      prisma.page.count({ where: { workspaceId, isDeleted: false } }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.attachment.count({
        where: { page: { workspaceId } },
      }),
      prisma.attachment.aggregate({
        where: { page: { workspaceId } },
        _sum: { size: true },
      }),
      prisma.todo.count({ where: { workspaceId } }),
      prisma.calendarEvent.count({ where: { workspaceId } }),
    ]);

    return NextResponse.json({
      pageCount,
      memberCount,
      attachmentCount,
      totalStorageBytes: storageAgg._sum.size || 0,
      todoCount,
      calendarEventCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("workspace_stats.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
