import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { listAccessiblePages } from "@/lib/pageAccess";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [workspace, accessible] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          members: member.isPublicViewer
            ? false
            : {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
          scimProvisionedMembers: member.isPublicViewer
            ? false
            : {
                select: {
                  userId: true,
                },
                distinct: ["userId"],
              },
          _count: {
            select: {
              pages: true,
            },
          },
        },
      }),
      listAccessiblePages(user.id, workspaceId),
    ]);

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rootPages = accessible.pages
      .filter((page) => page.parentId === null)
      .sort((a, b) => a.position - b.position);
    const scimProvisionedUserIds = new Set(
      member.isPublicViewer
        ? []
        : (workspace.scimProvisionedMembers || []).map((entry) => entry.userId)
    );

    return NextResponse.json({
      ...workspace,
      members: member.isPublicViewer
        ? []
        : workspace.members.map((workspaceMember) => ({
            ...workspaceMember,
            hasScimProvisionedAccess: scimProvisionedUserIds.has(workspaceMember.userId),
          })),
      pages: rootPages,
      currentRole: member.role,
      isPublicViewer: Boolean(member.isPublicViewer),
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
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;
    const requestContext = getAuditRequestContext(req);

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, description, visibility, publicWikiEnabled } = await req.json();
    const updateData: Record<string, unknown> = {};

    if (typeof name === "string") {
      updateData.name = name;
    }
    if (typeof description === "string" || description === null) {
      updateData.description = description;
    }
    if (visibility === "public" || visibility === "private") {
      updateData.visibility = visibility;
      // Public workspace automatically enables wiki
      if (visibility === "public") {
        updateData.publicWikiEnabled = true;
      }
    }
    if (typeof publicWikiEnabled === "boolean") {
      updateData.publicWikiEnabled = publicWikiEnabled;
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    if (Object.keys(updateData).length > 0) {
      await recordAuditLog({
        action: "workspace.updated",
        actor: createAuditActor(user, member.role),
        workspaceId,
        targetId: workspaceId,
        targetType: "workspace",
        metadata: {
          updatedFields: Object.keys(updateData),
          visibility: workspace.visibility,
          publicWikiEnabled: workspace.publicWikiEnabled,
        },
        context: requestContext,
      });
    }

    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;
    const requestContext = getAuditRequestContext(_req);

    const member = await checkWorkspaceAccess(user.id, workspaceId, ["owner"]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.workspace.delete({ where: { id: workspaceId } });

    await recordAuditLog({
      action: "workspace.deleted",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: workspaceId,
      targetType: "workspace",
      context: requestContext,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
