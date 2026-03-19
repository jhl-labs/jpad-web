import { NextRequest, NextResponse } from "next/server";
import { checkWorkspaceAccess, requireAuth } from "@/lib/auth/helpers";
import { resolveWorkspaceDraftAiProfile } from "@/lib/aiDraftProfile";
import { testConnectionForProfile } from "@/lib/llmProviders";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`ai-test-conn:${user.id}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const member = await checkWorkspaceAccess(user.id, workspaceId, ["owner", "admin"]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { profile?: unknown };
    const profile = await resolveWorkspaceDraftAiProfile(
      workspaceId,
      body.profile,
      member.role
    );

    const result = await testConnectionForProfile(profile);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Only owners can provide new AI API keys") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    logError("workspace.ai.test_connection.failed", error, { workspaceId }, req);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection test failed" },
      { status: 500 }
    );
  }
}
