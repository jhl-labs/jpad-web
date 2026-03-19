import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { getGoogleAuthUrl } from "@/lib/googleCalendar";
import { getWorkspaceGoogleCredentials } from "@/lib/googleCalendarSync";
import { logError } from "@/lib/logger";

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

    const credentials = await getWorkspaceGoogleCredentials(workspaceId);
    if (!credentials) {
      return NextResponse.json(
        { error: "Google Calendar is not configured for this workspace" },
        { status: 400 }
      );
    }

    const statePayload = JSON.stringify({ workspaceId, userId: user.id, ts: Date.now() });
    const hmac = crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET || "").update(statePayload).digest("base64url");
    const stateEncoded = Buffer.from(statePayload).toString("base64url") + "." + hmac;
    const url = getGoogleAuthUrl(credentials, stateEncoded);

    return NextResponse.redirect(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("google-calendar.connect", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
