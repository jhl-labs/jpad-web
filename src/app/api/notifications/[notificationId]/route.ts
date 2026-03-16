import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { markAsRead } from "@/lib/notifications";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`notification-patch:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

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
