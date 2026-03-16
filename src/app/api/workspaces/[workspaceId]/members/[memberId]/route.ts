import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { recordAuditLog, createAuditActor, getAuditRequestContext } from "@/lib/audit";

const ROLE_HIERARCHY = ["owner", "admin", "maintainer", "editor", "viewer"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, memberId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { role } = await req.json();

    if (!ROLE_HIERARCHY.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Cannot change to owner
    if (role === "owner") {
      return NextResponse.json(
        { error: "Cannot assign owner role" },
        { status: 400 }
      );
    }

    // Find target member
    const target = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!target || target.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const scimProvisionedGrant = await prisma.workspaceScimProvisionedMember.findFirst({
      where: {
        workspaceId,
        userId: target.userId,
      },
      select: { id: true },
    });

    if (target.managedByScim || scimProvisionedGrant) {
      return NextResponse.json(
        { error: "SCIM-managed members must be updated from the mapped IdP group or SCIM mapping." },
        { status: 409 }
      );
    }

    // Cannot change owner's role
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change owner role" },
        { status: 400 }
      );
    }

    // Admin cannot change other admin's role
    if (member.role === "admin" && target.role === "admin") {
      return NextResponse.json(
        { error: "Admins cannot change other admin roles" },
        { status: 403 }
      );
    }

    // Cannot change own role
    if (target.userId === user.id) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    const previousRole = target.role;

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await recordAuditLog({
      action: "member.role_change",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: memberId,
      targetType: "workspaceMember",
      metadata: { previousRole, newRole: role, targetUserId: target.userId },
      context: getAuditRequestContext(req),
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
