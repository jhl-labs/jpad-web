import { NextRequest, NextResponse } from "next/server";
import { checkWorkspaceAccess, requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { getVectorStoreRuntimeStatus } from "@/lib/vectorStore";

export async function GET(
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

    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    const status = await getVectorStoreRuntimeStatus({
      workspaceId,
      forceCheck: refresh,
    });

    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError("workspace.ai.vector_store_status.fetch_failed", error, { workspaceId }, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
