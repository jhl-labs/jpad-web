import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { exchangeCodeForTokens } from "@/lib/googleCalendar";
import { encryptSecret } from "@/lib/secrets";
import { prisma } from "@/lib/prisma";
import { getWorkspaceGoogleCredentials } from "@/lib/googleCalendarSync";

/**
 * GET /api/google-calendar/callback
 * OAuth2 redirect URI. Exchanges the authorization code for tokens,
 * stores them encrypted, and redirects back to the workspace calendar page.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const stateRaw = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.json(
        { error: `Google OAuth error: ${error}` },
        { status: 400 }
      );
    }

    if (!code || !stateRaw) {
      return NextResponse.json(
        { error: "Missing code or state parameter" },
        { status: 400 }
      );
    }

    // Decode state
    let state: { workspaceId: string; userId: string };
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    // Verify the logged-in user matches the state
    if (user.id !== state.userId) {
      return NextResponse.json({ error: "User mismatch" }, { status: 403 });
    }

    // Get workspace credentials
    const credentials = await getWorkspaceGoogleCredentials(state.workspaceId);
    if (!credentials) {
      return NextResponse.json({ error: "Google Calendar not configured" }, { status: 400 });
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(credentials, code);

    // Upsert the connection (encrypted tokens)
    await prisma.googleCalendarConnection.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: state.workspaceId,
        },
      },
      create: {
        userId: user.id,
        workspaceId: state.workspaceId,
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(tokens.refreshToken),
        tokenExpiry: tokens.expiresAt,
      },
      update: {
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(tokens.refreshToken),
        tokenExpiry: tokens.expiresAt,
        syncEnabled: true,
      },
    });

    // Redirect back to the workspace
    const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${base}/workspace/${state.workspaceId}?googleCalendarConnected=1`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
