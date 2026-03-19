import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/helpers";
import { checkOrganizationAccess } from "@/lib/organizations";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { rateLimitRedis } from "@/lib/rateLimit";
import {
  syncWorkspaceScimAccessForWorkspaces,
  validateWorkspaceScimMappingInput,
} from "@/lib/scimGroups";

const createMappingSchema = z.object({
  workspaceId: z.string().uuid("유효한 워크스페이스 ID가 아닙니다"),
  scimGroupId: z.string().uuid("유효한 SCIM 그룹 ID가 아닙니다"),
  role: z.enum(["admin", "maintainer", "editor", "viewer"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`scim-mapping-create:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { organizationId } = await params;
    const requestContext = getAuditRequestContext(req);
    const member = await checkOrganizationAccess(user.id, organizationId, [
      "owner",
      "admin",
    ]);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createMappingSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((entry) => entry.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const { workspace, group } = await validateWorkspaceScimMappingInput(
      organizationId,
      parsed.data
    );

    const existing = await prisma.workspaceScimGroupMapping.findUnique({
      where: {
        workspaceId_scimGroupId: {
          workspaceId: parsed.data.workspaceId,
          scimGroupId: parsed.data.scimGroupId,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This group is already mapped to the workspace" },
        { status: 409 }
      );
    }

    const mapping = await prisma.workspaceScimGroupMapping.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        scimGroupId: parsed.data.scimGroupId,
        role: parsed.data.role,
        createdByUserId: user.id,
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        scimGroup: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    await recordAuditLog({
      action: "organization.scim_group_mapping.created",
      actor: createAuditActor(user, member.role),
      workspaceId: parsed.data.workspaceId,
      targetId: mapping.id,
      targetType: "workspace_scim_group_mapping",
      metadata: {
        organizationId,
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        scimGroupId: group.id,
        scimGroupDisplayName: group.displayName,
        role: parsed.data.role,
      },
      context: requestContext,
    });

    await syncWorkspaceScimAccessForWorkspaces([parsed.data.workspaceId], {
      actor: createAuditActor(user, member.role),
      context: requestContext,
      trigger: "organization.scim_group_mapping.created",
      organizationId,
      sourceGroupIds: [parsed.data.scimGroupId],
    });

    return NextResponse.json(mapping, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("organization.scim_mapping.create_failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
