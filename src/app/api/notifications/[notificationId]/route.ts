import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { markAsRead } from "@/lib/notifications";
import { logError } from "@/lib/logger";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const user = await requireAuth();
    const { notificationId } = await params;

    const result = await markAsRead(notificationId, user.id);

    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("notifications.patch.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
