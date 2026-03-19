import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { getPageAccessContext } from "@/lib/pageAccess";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string; commentId: string }> }
) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);
    const { pageId, commentId } = await params;

    if (!(await rateLimitRedis(`comment:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

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
      if (typeof content === "string" && content.length > 10000) {
        return NextResponse.json({ error: "Comment too long" }, { status: 400 });
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

    await recordAuditLog({
      action: "comment.updated",
      actor: createAuditActor(user, access.member.role),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: commentId,
      targetType: "comment",
      metadata: {
        contentChanged: content !== undefined,
        resolvedChanged: resolved !== undefined,
      },
      context: requestContext,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("comments.patch.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string; commentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId, commentId } = await params;

    if (!(await rateLimitRedis(`comment:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

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

    await recordAuditLog({
      action: "comment.deleted",
      actor: createAuditActor(user, access.member.role),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: commentId,
      targetType: "comment",
      context: getAuditRequestContext(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("comments.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
