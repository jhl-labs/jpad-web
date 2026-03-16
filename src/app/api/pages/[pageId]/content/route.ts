import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { readPage, savePage } from "@/lib/git/repository";
import { parseBacklinks } from "@/lib/markdown/serializer";
import { getPageAccessContext } from "@/lib/pageAccess";
import { rateLimitRedis } from "@/lib/rateLimit";
import {
  enqueuePageReindexJob,
  triggerBestEffortSearchIndexProcessing,
} from "@/lib/semanticIndexQueue";

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

    const content = await readPage(access.page.workspaceId, access.page.slug);

    return NextResponse.json({
      content: content || `# ${access.page.title}\n`,
      role: access.member.role,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const requestContext = getAuditRequestContext(req);
    const { content } = await req.json();

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`content-save:${user.id}`, 60, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "Content must be a string" },
        { status: 400 }
      );
    }

    const MAX_CONTENT_SIZE = 1 * 1024 * 1024; // 1MB
    if (new TextEncoder().encode(content).length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: "Content exceeds maximum size of 1MB" },
        { status: 400 }
      );
    }

    // Save to git
    await savePage(access.page.workspaceId, access.page.slug, content, user.name);

    // Update backlinks
    const linkedRefs = parseBacklinks(content);

    // Update backlinks atomically
    const linkedIdentifiers = [...new Set(linkedRefs.map((ref) => ref.identifier))];
    let backlinkData: { fromPageId: string; toPageId: string }[] = [];

    if (linkedRefs.length > 0) {
      const targetPages = await prisma.page.findMany({
        where: {
          workspaceId: access.page.workspaceId,
          isDeleted: false,
          OR: [
            { slug: { in: linkedIdentifiers } },
            { title: { in: linkedIdentifiers } },
          ],
        },
        select: { id: true, slug: true, title: true },
      });

      const pageBySlug = new Map(targetPages.map((target) => [target.slug, target]));
      const pagesByTitle = new Map<string, typeof targetPages>();
      for (const target of targetPages) {
        const matches = pagesByTitle.get(target.title) ?? [];
        matches.push(target);
        pagesByTitle.set(target.title, matches);
      }

      const backlinkTargetIds = new Set<string>();
      for (const ref of linkedRefs) {
        const bySlug = pageBySlug.get(ref.identifier);
        if (bySlug && bySlug.id !== pageId) {
          backlinkTargetIds.add(bySlug.id);
          continue;
        }

        const titleMatches = pagesByTitle.get(ref.identifier) ?? [];
        if (titleMatches.length === 1 && titleMatches[0].id !== pageId) {
          backlinkTargetIds.add(titleMatches[0].id);
        }
      }

      backlinkData = [...backlinkTargetIds].map((toPageId) => ({
        fromPageId: pageId,
        toPageId,
      }));
    }

    // Remove old backlinks, create new ones, and update page timestamp in a single transaction
    await prisma.$transaction(async (tx) => {
      await tx.backlink.deleteMany({ where: { fromPageId: pageId } });
      if (backlinkData.length > 0) {
        await tx.backlink.createMany({
          data: backlinkData,
          skipDuplicates: true,
        });
      }
      await tx.page.update({
        where: { id: pageId },
        data: { updatedAt: new Date() },
      });
    });

    await recordAuditLog({
      action: "page.content.updated",
      actor: createAuditActor(user, access.member?.role ?? null),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: {
        slug: access.page.slug,
      },
      context: requestContext,
    });

    await enqueuePageReindexJob({
      workspaceId: access.page.workspaceId,
      pageId,
      slug: access.page.slug,
      title: access.page.title,
    });
    triggerBestEffortSearchIndexProcessing(access.page.workspaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("content.put.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
