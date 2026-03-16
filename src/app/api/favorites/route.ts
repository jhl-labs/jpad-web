import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { listAccessiblePageIds, getPageAccessContext } from "@/lib/pageAccess";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accessibleIds = await listAccessiblePageIds(user.id, workspaceId);

    const favorites = await prisma.favorite.findMany({
      where: {
        userId: user.id,
        page: { workspaceId },
      },
      include: {
        page: {
          select: {
            id: true,
            title: true,
            slug: true,
            icon: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const pages = favorites
      .map((f) => f.page)
      .filter((page) => accessibleIds.has(page.id));
    return NextResponse.json(pages);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { pageId } = await req.json();

    if (!pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 });
    }

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { id: true, workspaceId: true },
    });

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const access = await getPageAccessContext(user.id, pageId);
    if (!access?.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const favorite = await prisma.favorite.upsert({
      where: {
        userId_pageId: { userId: user.id, pageId },
      },
      create: { userId: user.id, pageId },
      update: {},
    });

    return NextResponse.json(favorite, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { pageId } = await req.json();

    if (!pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 });
    }

    await prisma.favorite.deleteMany({
      where: { userId: user.id, pageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
