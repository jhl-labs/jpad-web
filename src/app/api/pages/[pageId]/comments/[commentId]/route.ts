import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { getPageAccessContext } from "@/lib/pageAccess";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string; commentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId, commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { page: true },
    });

    if (!comment || comment.pageId !== pageId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getPageAccessContext(user.id, comment.pageId);
    if (!access?.canView || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { content, resolved } = await req.json();

    // content와 resolved 둘 다 undefined일 때 빈 update 방지
    if (content === undefined && resolved === undefined) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (content !== undefined) {
      if (comment.userId !== user.id) {
        return NextResponse.json({ error: "Only author can edit content" }, { status: 403 });
      }
      if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
      }
      updateData.content = content.trim();
    }

    if (resolved !== undefined) {
      const canResolve =
        comment.userId === user.id ||
        ["owner", "admin", "maintainer", "editor"].includes(access.member.role);
      if (!canResolve) {
        return NextResponse.json({ error: "Cannot resolve" }, { status: 403 });
      }
      updateData.resolved = Boolean(resolved);
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string; commentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId, commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { page: true },
    });

    if (!comment || comment.pageId !== pageId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getPageAccessContext(user.id, comment.pageId);
    if (!access?.canView || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canDelete =
      comment.userId === user.id ||
      ["owner", "admin", "maintainer"].includes(access.member.role);

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
