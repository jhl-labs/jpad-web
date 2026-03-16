import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { getPageHistory, getPageAtCommit } from "@/lib/git/repository";
import { getPageAccessContext } from "@/lib/pageAccess";
import { logError } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const oid = req.nextUrl.searchParams.get("oid");

    if (oid) {
      const content = await getPageAtCommit(
        access.page.workspaceId,
        access.page.slug,
        oid
      );
      return NextResponse.json({ content });
    }

    const history = await getPageHistory(access.page.workspaceId, access.page.slug);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("pages.history.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
