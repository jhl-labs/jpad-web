import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { initRepo } from "@/lib/git/repository";
import { handleApiError } from "@/lib/apiErrorHandler";
import { rateLimitRedis } from "@/lib/rateLimit";
import { slugify } from "@/lib/utils";
import { z } from "zod";
import {
  canCreateOrganizationWorkspace,
  checkOrganizationAccess,
} from "@/lib/organizations";

const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be 100 characters or less"),
  description: z.string().max(500).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  organizationId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");

    const whereClause = { members: { some: { userId: user.id } } };
    const includeClause = {
      members: { select: { role: true, userId: true } },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      _count: { select: { pages: true } },
    } as const;

    // If no page param, return all (backward compat)
    if (!pageParam) {
      const workspaces = await prisma.workspace.findMany({
        where: whereClause,
        include: includeClause,
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json(workspaces);
    }

    // Paginated response
    const page = Math.max(1, parseInt(pageParam) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitParam || "20") || 20));
    const skip = (page - 1) * limit;

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where: whereClause,
        include: includeClause,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.workspace.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      data: workspaces,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, "workspaces.list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);

    if (!(await rateLimitRedis(`ws-create:${user.id}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();

    const parsed = createWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const { name, description, visibility, organizationId } = parsed.data;

    let slug = slugify(name);
    if (!slug) slug = "workspace";

    // Ensure unique slug
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    if (organizationId) {
      const organizationMember = await checkOrganizationAccess(user.id, organizationId, [
        "owner",
        "admin",
      ]);
      if (!organizationMember || !canCreateOrganizationWorkspace(organizationMember.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug,
        description: description || null,
        visibility: visibility || "private",
        publicWikiEnabled: visibility === "public",
        organizationId: organizationId || null,
        members: {
          create: { userId: user.id, role: "owner" },
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Initialize git repo
    await initRepo(workspace.id);

    await recordAuditLog({
      action: "workspace.created",
      actor: createAuditActor(user, "owner"),
      workspaceId: workspace.id,
      targetId: workspace.id,
      targetType: "workspace",
      metadata: {
        name: workspace.name,
        visibility: workspace.visibility,
      },
      context: requestContext,
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return handleApiError(error, "workspaces.create");
  }
}
