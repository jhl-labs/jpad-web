import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { initRepo, savePage } from "@/lib/git/repository";
import { logError } from "@/lib/logger";
import { getPageAccessContext, listAccessiblePages } from "@/lib/pageAccess";
import {
  enqueuePageReindexJob,
  triggerBestEffortSearchIndexProcessing,
} from "@/lib/semanticIndexQueue";
import { slugify } from "@/lib/utils";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";
import { z } from "zod";

const createPageSchema = z.object({
  workspaceId: z.string().min(1, "workspaceId는 필수입니다"),
  title: z
    .string()
    .max(200, "제목은 200자 이하여야 합니다")
    .optional(),
  parentId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId required" },
        { status: 400 }
      );
    }

    const { member, pages: accessiblePages } = await listAccessiblePages(
      user.id,
      workspaceId
    );
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If no page param, return all pages (backward compat for sidebar)
    if (!pageParam) {
      return NextResponse.json(accessiblePages);
    }

    // Paginated response
    const page = Math.max(1, parseInt(pageParam) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitParam || "50") || 50));
    const skip = (page - 1) * limit;

    const pages = accessiblePages.slice(skip, skip + limit);
    const total = accessiblePages.length;

    return NextResponse.json({
      data: pages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
    const requestContext = getAuditRequestContext(req);
    const body = await req.json();

    const parsed = createPageSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const { workspaceId, title, parentId } = parsed.data;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await getEffectiveWorkspaceSettings(workspaceId);

    let inheritedAccessMode: "workspace" | "restricted" =
      settings.defaultPageAccess;
    let inheritedUserIds: string[] = [];

    if (parentId) {
      const parentAccess = await getPageAccessContext(user.id, parentId);
      if (!parentAccess || parentAccess.page.workspaceId !== workspaceId) {
        return NextResponse.json(
          { error: "Parent page not found" },
          { status: 404 }
        );
      }
      if (!parentAccess.canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      inheritedAccessMode = parentAccess.page.accessMode;
      if (inheritedAccessMode === "restricted") {
        const permissions = await prisma.pagePermission.findMany({
          where: { pageId: parentId },
          select: { userId: true },
        });
        inheritedUserIds = permissions.map((permission) => permission.userId);
      }
    }

    if (inheritedAccessMode === "restricted") {
      inheritedUserIds = [...new Set([...inheritedUserIds, user.id])];
    }

    const pageTitle = title || "Untitled";
    let slug = slugify(pageTitle);
    if (!slug) slug = "untitled";

    // Ensure unique slug in workspace
    const existing = await prisma.page.findFirst({
      where: { workspaceId, slug },
    });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Get max position
    const maxPos = await prisma.page.aggregate({
      where: { workspaceId, parentId: parentId || null },
      _max: { position: true },
    });

    const page = await prisma.$transaction(async (tx) => {
      let created;
      try {
        created = await tx.page.create({
          data: {
            title: pageTitle,
            slug,
            workspaceId,
            parentId: parentId || null,
            accessMode: inheritedAccessMode,
            position: (maxPos._max.position || 0) + 1,
          },
        });
      } catch (createError) {
        // Handle unique constraint violation (race condition on slug)
        if (
          createError instanceof Error &&
          "code" in createError &&
          (createError as { code: string }).code === "P2002"
        ) {
          slug = `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          created = await tx.page.create({
            data: {
              title: pageTitle,
              slug,
              workspaceId,
              parentId: parentId || null,
              accessMode: inheritedAccessMode,
              position: (maxPos._max.position || 0) + 1,
            },
          });
        } else {
          throw createError;
        }
      }

      if (inheritedAccessMode === "restricted" && inheritedUserIds.length > 0) {
        await tx.pagePermission.createMany({
          data: inheritedUserIds.map((userId) => ({
            pageId: created.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    // Create initial file in git
    await initRepo(workspaceId);
    const initialContent = `# ${pageTitle}\n`;
    await savePage(
      workspaceId,
      slug,
      initialContent,
      user.name,
      `Create page: ${pageTitle}`
    );

    await enqueuePageReindexJob({
      workspaceId,
      pageId: page.id,
      slug,
      title: pageTitle,
    });
    triggerBestEffortSearchIndexProcessing(workspaceId);

    await recordAuditLog({
      action: "page.created",
      actor: createAuditActor(user, member.role),
      workspaceId,
      pageId: page.id,
      targetId: page.id,
      targetType: "page",
      metadata: {
        title: pageTitle,
        slug,
        parentId: parentId || null,
        accessMode: inheritedAccessMode,
      },
      context: requestContext,
    });

    return NextResponse.json(page, { status: 201 });
  } catch (e) {
    logError("page.create_failed", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
