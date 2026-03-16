import { NextRequest, NextResponse } from "next/server";
import { checkWorkspaceAccess, requireAuth } from "@/lib/auth/helpers";
import { resolveWorkspaceDraftAiProfile } from "@/lib/aiDraftProfile";
import { listModelsForProfile } from "@/lib/llmProviders";
import { logError } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  try {
    const user = await requireAuth();
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

    const models = await listModelsForProfile(profile);
    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Only owners can provide new AI API keys") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    logError("workspace.ai.models.fetch_failed", error, { workspaceId }, req);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "모델 목록을 가져오지 못했습니다." },
      { status: 500 }
    );
  }
}
