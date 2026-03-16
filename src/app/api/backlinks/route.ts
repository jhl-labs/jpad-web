import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { getPageAccessContext, listAccessiblePageIds } from "@/lib/pageAccess";
import { logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const pageId = req.nextUrl.searchParams.get("pageId");
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!pageId || !workspaceId) {
      return NextResponse.json(
        { error: "pageId and workspaceId required" },
        { status: 400 }
      );
    }

    const access = await getPageAccessContext(user.id, pageId);
    if (!access || access.page.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accessibleIds = await listAccessiblePageIds(user.id, workspaceId);

    // Pages that link TO this page
    const incomingLinks = await prisma.backlink.findMany({
      where: {
        toPageId: pageId,
        fromPage: {
          workspaceId,
          isDeleted: false,
        },
      },
      include: {
        fromPage: { select: { id: true, title: true, slug: true, icon: true } },
      },
    });

    // Pages that this page links TO
    const outgoingLinks = await prisma.backlink.findMany({
      where: {
        fromPageId: pageId,
        toPage: {
          workspaceId,
          isDeleted: false,
        },
      },
      include: {
        toPage: { select: { id: true, title: true, slug: true, icon: true } },
      },
    });

    return NextResponse.json({
      incoming: incomingLinks
        .map((l) => l.fromPage)
        .filter((page) => accessibleIds.has(page.id)),
      outgoing: outgoingLinks
        .map((l) => l.toPage)
        .filter((page) => accessibleIds.has(page.id)),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("backlinks.get.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
