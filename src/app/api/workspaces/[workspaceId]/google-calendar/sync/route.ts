import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { syncCalendar } from "@/lib/googleCalendarSync";
import { rateLimitRedis } from "@/lib/rateLimit";

/**
 * POST /api/workspaces/:workspaceId/google-calendar/sync
 * Triggers a manual bidirectional sync between jpad and Google Calendar.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const user = await requireAuth();

    if (!(await rateLimitRedis(`gcal-sync:${user.id}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await syncCalendar(workspaceId, user.id);

    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "No active Google Calendar connection") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
