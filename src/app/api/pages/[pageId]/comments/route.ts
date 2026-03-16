import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { getPageAccessContext } from "@/lib/pageAccess";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const whereClause = { pageId, parentId: null } as const;
    const includeClause = {
      user: { select: { id: true, name: true, email: true } },
      replies: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" as const },
      },
    };

    // If no page param, return all (backward compat)
    if (!pageParam) {
      const comments = await prisma.comment.findMany({
        where: whereClause,
        include: includeClause,
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(comments);
    }

    // Paginated response
    const currentPage = Math.max(1, parseInt(pageParam) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitParam || "20") || 20));
    const skip = (currentPage - 1) * limit;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: whereClause,
        include: includeClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.comment.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      data: comments,
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("comments.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);

    if (!(await rateLimitRedis(`comment:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { pageId } = await params;
    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { content, parentId } = await req.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (content.length > 10000) {
      return NextResponse.json(
        { error: "Content must be 10000 characters or less" },
        { status: 400 }
      );
    }

    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });
        if (!parentComment || parentComment.pageId !== pageId) {
          return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
        }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        pageId,
        userId: user.id,
        parentId: parentId || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await recordAuditLog({
      action: "comment.created",
      actor: createAuditActor(user, access.member?.role ?? null),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: comment.id,
      targetType: "comment",
      metadata: {
        isReply: Boolean(parentId),
      },
      context: requestContext,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("comments.post.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
