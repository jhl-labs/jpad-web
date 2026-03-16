import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { readPage } from "@/lib/git/repository";
import { logError } from "@/lib/logger";
import { permanentlyDeletePageSubtree } from "@/lib/pageLifecycle";
import {
  collectPageAncestors,
  collectPageSubtree,
  getWorkspacePages,
} from "@/lib/pages";
import {
  enqueuePageReindexJob,
  triggerBestEffortSearchIndexProcessing,
} from "@/lib/semanticIndexQueue";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const requestContext = getAuditRequestContext(_req);

    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const member = await checkWorkspaceAccess(user.id, page.workspaceId, [
      "owner",
      "admin",
      "maintainer",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workspacePages = await getWorkspacePages(page.workspaceId);
    const subtree = collectPageSubtree(workspacePages, pageId);
    const ancestors = collectPageAncestors(workspacePages, pageId).filter(
      (entry) => entry.isDeleted
    );
    const restoreIds = [...new Set([
      ...ancestors.map((entry) => entry.id),
      ...subtree.map((entry) => entry.id),
    ])];
    const restoredEntries = workspacePages.filter((entry) =>
      restoreIds.includes(entry.id)
    );

    await prisma.page.updateMany({
      where: { id: { in: restoreIds } },
      data: { isDeleted: false, deletedAt: null },
    });

    await Promise.all(
      restoredEntries.map(async (entry) => {
        const content = await readPage(page.workspaceId, entry.slug);
        if (!content) {
          return;
        }
        await enqueuePageReindexJob({
          workspaceId: page.workspaceId,
          pageId: entry.id,
          slug: entry.slug,
          title: entry.title,
        });
      })
    );
    triggerBestEffortSearchIndexProcessing(page.workspaceId);

    await recordAuditLog({
      action: "page.restored",
      actor: createAuditActor(user, member.role),
      workspaceId: page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: { restoredCount: restoreIds.length },
      context: requestContext,
    });

    return NextResponse.json({ success: true, restoredCount: restoreIds.length });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("trash.patch.unhandled_error", error);
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

    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const member = await checkWorkspaceAccess(user.id, page.workspaceId, [
      "owner",
      "admin",
      "maintainer",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await permanentlyDeletePageSubtree(page.workspaceId, pageId, {
      actorName: user.name,
    });

    await recordAuditLog({
      action: "page.deleted.permanently",
      actor: createAuditActor(user, member.role),
      workspaceId: page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: {
        deletedCount: result.deletedCount,
        attachmentCount: result.attachmentCount,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("trash.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
