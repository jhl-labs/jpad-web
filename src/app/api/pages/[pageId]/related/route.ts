import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { readPage } from "@/lib/git/repository";
import { getPageAccessContext, listAccessiblePages } from "@/lib/pageAccess";
import { findRelatedPages } from "@/lib/semanticSearch";
import { logError } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
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

    const [content, accessible] = await Promise.all([
      readPage(access.page.workspaceId, access.page.slug),
      listAccessiblePages(user.id, access.page.workspaceId),
    ]);

    const data = await findRelatedPages(
      {
        workspaceId: access.page.workspaceId,
        pageId: access.page.id,
        title: access.page.title,
        content,
      },
      accessible.pages.map((page) => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        icon: page.icon,
        updatedAt: page.updatedAt,
      })),
      5
    );

    return NextResponse.json({
      data,
      mode: data.length > 0 ? "semantic" : "empty",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("related.get.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
