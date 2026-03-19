import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { getPageAccessContext } from "@/lib/pageAccess";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

// GET — 잠금 상태 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;

    const access = await getPageAccessContext(user.id, pageId);
    if (!access || !access.canView) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        isLocked: true,
        lockedById: true,
        lockedAt: true,
      },
    });

    if (!page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let lockedByName: string | null = null;
    if (page.isLocked && page.lockedById) {
      const lockedByUser = await prisma.user.findUnique({
        where: { id: page.lockedById },
        select: { name: true },
      });
      lockedByName = lockedByUser?.name || null;
    }

    return NextResponse.json({
      isLocked: page.isLocked,
      lockedById: page.lockedById,
      lockedAt: page.lockedAt,
      lockedByName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("page-lock-get", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — 페이지 잠금
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;

    const allowed = await rateLimitRedis(`page-lock:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const access = await getPageAccessContext(user.id, pageId);
    if (!access || !access.canView || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // editor 이상만 잠금 가능
    const editRoles = ["owner", "admin", "maintainer", "editor"];
    if (!editRoles.includes(access.member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const page = await prisma.page.update({
      where: { id: pageId },
      data: {
        isLocked: true,
        lockedById: user.id,
        lockedAt: new Date(),
      },
    });

    return NextResponse.json({
      isLocked: page.isLocked,
      lockedById: page.lockedById,
      lockedAt: page.lockedAt,
      lockedByName: user.name,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("page-lock-post", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — 페이지 잠금 해제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;

    const allowed = await rateLimitRedis(`page-unlock:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const access = await getPageAccessContext(user.id, pageId);
    if (!access || !access.canView || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentPage = await prisma.page.findUnique({
      where: { id: pageId },
      select: { isLocked: true, lockedById: true },
    });

    if (!currentPage) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 본인이 잠근 경우 또는 admin/owner만 해제 가능
    const isLocker = currentPage.lockedById === user.id;
    const isAdmin = ["owner", "admin"].includes(access.member.role);
    if (!isLocker && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.page.update({
      where: { id: pageId },
      data: {
        isLocked: false,
        lockedById: null,
        lockedAt: null,
      },
    });

    return NextResponse.json({ isLocked: false });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("page-lock-delete", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
