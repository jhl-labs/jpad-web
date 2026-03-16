import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { getGoogleAuthUrl } from "@/lib/googleCalendar";
import { getWorkspaceGoogleCredentials } from "@/lib/googleCalendarSync";

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
        { error: "Google Calendar이 설정되지 않았습니다. 워크스페이스 설정에서 Client ID와 Secret을 입력해주세요." },
        { status: 400 }
      );
    }

    const state = JSON.stringify({ workspaceId, userId: user.id });
    const stateEncoded = Buffer.from(state).toString("base64url");
    const url = getGoogleAuthUrl(credentials, stateEncoded);

    return NextResponse.redirect(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
