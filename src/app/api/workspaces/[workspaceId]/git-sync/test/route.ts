import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { encryptSecret } from "@/lib/secrets";
import { testRemoteConnection } from "@/lib/git/remote";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limited = await rateLimitRedis(`git-sync:test:${user.id}`, 10, 60_000);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { url, token } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    // Encrypt token if provided (testRemoteConnection expects encrypted token)
    const encryptedToken = token ? encryptSecret(token) : null;

    const result = await testRemoteConnection(url, encryptedToken);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("git_sync.test.unhandled_error", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
