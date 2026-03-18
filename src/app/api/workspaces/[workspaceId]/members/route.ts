import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { rateLimitRedis } from "@/lib/rateLimit";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";
import { normalizeEmailAddress } from "@/lib/auth/config";
import { handleApiError } from "@/lib/apiErrorHandler";

export async function POST(
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
      "maintainer",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`member-invite:${user.id}`, 20, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const settings = await getEffectiveWorkspaceSettings(workspaceId);

    if (member.role === "maintainer" && !settings.allowMemberInvite) {
      return NextResponse.json(
        { error: "Maintainer invitations are disabled for this workspace" },
        { status: 403 }
      );
    }

    const { email, role } = await req.json();
    const normalizedEmail =
      typeof email === "string" ? normalizeEmailAddress(email) : "";
    const assignRole = role || "editor";
    const validRoles = ["admin", "maintainer", "editor", "viewer"];

    if (!normalizedEmail || !validRoles.includes(assignRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Maintainer can only invite editor or viewer
    if (member.role === "maintainer" && !["editor", "viewer"].includes(assignRole)) {
      return NextResponse.json(
        { error: "Maintainers can only invite editors or viewers" },
        { status: 403 }
      );
    }

    const matchedUsers = await prisma.user.findMany({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      take: 2,
    });
    if (matchedUsers.length > 1) {
      return NextResponse.json(
        { error: "Multiple users match this email address" },
        { status: 409 }
      );
    }
    const targetUser = matchedUsers[0];
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent changing existing owner/admin membership via invite
    const existing = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUser.id, workspaceId } },
    });
    if (existing && existing.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change owner membership" },
        { status: 400 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: "User is already a workspace member. Use the role change action instead." },
        { status: 409 }
      );
    }

    const membership = await prisma.workspaceMember.create({
      data: {
        userId: targetUser.id,
        workspaceId,
        role: assignRole,
      },
    });

    await recordAuditLog({
      action: "workspace.member.invited",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: targetUser.id,
      targetType: "user",
      metadata: {
        invitedRole: assignRole,
        invitedEmail: targetUser.email,
      },
      context: requestContext,
    });

    return NextResponse.json(membership);
  } catch (error) {
    return handleApiError(error, "members.post.unhandled_error");
  }
}

export async function DELETE(
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

    const { userId: rawUserId } = await req.json();

    if (typeof rawUserId !== "string" || !rawUserId.trim()) {
      return NextResponse.json({ error: "userId must be a non-empty string" }, { status: 400 });
    }
    const userId = rawUserId.trim();

    if (userId === user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself" },
        { status: 400 }
      );
    }

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      include: {
        user: {
          select: { email: true },
        },
      },
    });
    const scimProvisionedGrant = targetMember
      ? await prisma.workspaceScimProvisionedMember.findFirst({
          where: {
            workspaceId,
            userId,
          },
          select: { id: true },
        })
      : null;
    if (targetMember?.managedByScim || scimProvisionedGrant) {
      return NextResponse.json(
        { error: "SCIM-managed members must be removed from the mapped IdP group or SCIM mapping." },
        { status: 409 }
      );
    }

    await prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId, workspaceId } },
    });

    await recordAuditLog({
      action: "workspace.member.removed",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: userId,
      targetType: "user",
      metadata: {
        removedEmail: targetMember?.user.email ?? null,
        removedRole: targetMember?.role ?? null,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "members.delete.unhandled_error");
  }
}
