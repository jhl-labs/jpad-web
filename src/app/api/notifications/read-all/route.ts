import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { markAllAsRead } from "@/lib/notifications";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspaceId as string | undefined;

    const result = await markAllAsRead(user.id, workspaceId);

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("notifications.read-all.post.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
