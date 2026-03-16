import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { prisma } from "@/lib/prisma";
import { rateLimitRedis } from "@/lib/rateLimit";

/**
 * GET /api/workspaces/:workspaceId/google-calendar
 * Returns the current user's Google Calendar connection status for this workspace.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const user = await requireAuth();
    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: {
        userId_workspaceId: { userId: user.id, workspaceId },
      },
      select: {
        id: true,
        calendarId: true,
        syncEnabled: true,
        lastSyncAt: true,
        tokenExpiry: true,
        createdAt: true,
      },
    });

    if (!connection) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      connection: {
        id: connection.id,
        calendarId: connection.calendarId,
        syncEnabled: connection.syncEnabled,
        lastSyncAt: connection.lastSyncAt,
        tokenExpiry: connection.tokenExpiry,
        createdAt: connection.createdAt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/workspaces/:workspaceId/google-calendar
 * Disconnects (removes) the Google Calendar connection.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const user = await requireAuth();

    if (!(await rateLimitRedis(`gcal-disconnect:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.googleCalendarConnection.deleteMany({
      where: { userId: user.id, workspaceId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
