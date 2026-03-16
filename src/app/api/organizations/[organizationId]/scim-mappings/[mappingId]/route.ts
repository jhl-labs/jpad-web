import { NextRequest, NextResponse } from "next/server";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/helpers";
import { checkOrganizationAccess } from "@/lib/organizations";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { rateLimitRedis } from "@/lib/rateLimit";
import { syncWorkspaceScimAccessForWorkspaces } from "@/lib/scimGroups";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string; mappingId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`scim-mapping-delete:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { organizationId, mappingId } = await params;
    const requestContext = getAuditRequestContext(req);
    const member = await checkOrganizationAccess(user.id, organizationId, [
      "owner",
      "admin",
    ]);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const mapping = await prisma.workspaceScimGroupMapping.findUnique({
      where: { id: mappingId },
      include: {
        workspace: {
          select: {
            id: true,
            organizationId: true,
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

    if (!mapping || mapping.workspace.organizationId !== organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.workspaceScimGroupMapping.delete({
      where: { id: mappingId },
    });

    await recordAuditLog({
      action: "organization.scim_group_mapping.deleted",
      actor: createAuditActor(user, member.role),
      workspaceId: mapping.workspaceId,
      targetId: mapping.id,
      targetType: "workspace_scim_group_mapping",
      metadata: {
        organizationId,
        workspaceSlug: mapping.workspace.slug,
        scimGroupId: mapping.scimGroup.id,
        scimGroupDisplayName: mapping.scimGroup.displayName,
        role: mapping.role,
      },
      context: requestContext,
    });

    await syncWorkspaceScimAccessForWorkspaces([mapping.workspaceId], {
      actor: createAuditActor(user, member.role),
      context: requestContext,
      trigger: "organization.scim_group_mapping.deleted",
      organizationId,
      sourceGroupIds: [mapping.scimGroupId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("organization.scim_mapping.delete_failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
