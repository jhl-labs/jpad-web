import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { collectPageSubtree, getWorkspacePages } from "@/lib/pages";
import { getPageAccessContext, listAccessiblePageIds } from "@/lib/pageAccess";
import { rateLimitRedis } from "@/lib/rateLimit";
import { removePageEmbeddings } from "@/lib/semanticSearch";
import {
  enqueuePageReindexJob,
  triggerBestEffortSearchIndexProcessing,
} from "@/lib/semanticIndexQueue";
// deletePageGit is used for permanent deletion in trash API

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
    if (!access.canView || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        children: {
          where: { isDeleted: false },
          orderBy: { position: "asc" },
        },
        backlinksTo: {
          where: {
            fromPage: {
              isDeleted: false,
            },
          },
          include: {
            fromPage: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });

    if (!page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const accessibleChildIds = await listAccessiblePageIds(
      user.id,
      access.page.workspaceId
    );
    const visibleChildren = page.children.filter((child) =>
      accessibleChildIds.has(child.id)
    );
    const visibleBacklinksTo = page.backlinksTo.filter((link) =>
      accessibleChildIds.has(link.fromPage.id)
    );

    return NextResponse.json({
      ...page,
      children: visibleChildren,
      backlinksTo: visibleBacklinksTo,
      currentRole: access.member.role,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const requestContext = getAuditRequestContext(req);
    const data = await req.json();

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canEdit || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`page-update:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) {
      if (typeof data.title !== "string") {
        return NextResponse.json({ error: "title must be a string" }, { status: 400 });
      }
      if (data.title.length > 500) {
        return NextResponse.json({ error: "title must be 500 characters or less" }, { status: 400 });
      }
      updateData.title = data.title;
    }
    if (data.icon !== undefined) {
      if (data.icon !== null && typeof data.icon !== "string") {
        return NextResponse.json({ error: "icon must be a string or null" }, { status: 400 });
      }
      if (typeof data.icon === "string" && data.icon.length > 50) {
        return NextResponse.json({ error: "icon must be 50 characters or less" }, { status: 400 });
      }
      updateData.icon = data.icon;
    }
    if (data.coverImage !== undefined) {
      if (data.coverImage !== null && typeof data.coverImage !== "string") {
        return NextResponse.json({ error: "coverImage must be a string or null" }, { status: 400 });
      }
      if (typeof data.coverImage === "string" && data.coverImage.length > 2000) {
        return NextResponse.json({ error: "coverImage must be 2000 characters or less" }, { status: 400 });
      }
      updateData.coverImage = data.coverImage;
    }
    if (data.parentId !== undefined) {
      if (data.parentId === pageId) {
        return NextResponse.json(
          { error: "Page cannot be its own parent" },
          { status: 400 }
        );
      }

      if (data.parentId !== null) {
        const targetParent = await getPageAccessContext(user.id, data.parentId);
        if (
          !targetParent ||
          targetParent.page.workspaceId !== access.page.workspaceId
        ) {
          return NextResponse.json({ error: "Parent page not found" }, { status: 400 });
        }
        if (!targetParent.canEdit) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const workspacePages = await getWorkspacePages(access.page.workspaceId);
        const subtree = collectPageSubtree(workspacePages, pageId);
        if (subtree.some((entry) => entry.id === data.parentId)) {
          return NextResponse.json(
            { error: "Page cannot be moved into its own subtree" },
            { status: 400 }
          );
        }
      }

      updateData.parentId = data.parentId;
    }
    if (data.position !== undefined) {
      if (typeof data.position !== "number" || !Number.isInteger(data.position) || data.position < 0) {
        return NextResponse.json({ error: "position must be a non-negative integer" }, { status: 400 });
      }
      updateData.position = data.position;
    }

    const updated = await prisma.page.update({
      where: { id: pageId },
      data: updateData,
    });

    await recordAuditLog({
      action: "page.metadata.updated",
      actor: createAuditActor(user, access.member.role),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: {
        updatedFields: Object.keys(updateData),
      },
      context: requestContext,
    });

    if (typeof data.title === "string" && data.title.trim()) {
      await enqueuePageReindexJob({
        workspaceId: updated.workspaceId,
        pageId: updated.id,
        slug: updated.slug,
        title: updated.title,
      });
      triggerBestEffortSearchIndexProcessing(updated.workspaceId);
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("pages.patch.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const requestContext = getAuditRequestContext(_req);

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (access.page.isDeleted) {
      return NextResponse.json({ success: true });
    }

    if (
      !access.member ||
      !["owner", "admin", "maintainer"].includes(access.member.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`page-delete:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const workspacePages = await getWorkspacePages(access.page.workspaceId);
    const subtree = collectPageSubtree(workspacePages, pageId);
    const deletedAt = new Date();

    const subtreeIds = subtree.map((entry) => entry.id);
    await prisma.$transaction(async (tx) => {
      await tx.page.updateMany({
        where: { id: { in: subtreeIds } },
        data: { isDeleted: true, deletedAt },
      });
      await removePageEmbeddings(subtreeIds);
    });

    await recordAuditLog({
      action: "page.deleted",
      actor: createAuditActor(user, access.member!.role),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: {
        title: access.page.title,
        deletedCount: subtree.length,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true, deletedCount: subtree.length });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("pages.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
