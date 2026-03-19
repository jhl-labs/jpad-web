import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { getPageAccessContext } from "@/lib/pageAccess";
import { prisma } from "@/lib/prisma";
import { rateLimitRedis } from "@/lib/rateLimit";

function normalizeAccessMode(value: unknown): "workspace" | "restricted" | null {
  return value === "workspace" || value === "restricted" ? value : null;
}

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
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const permissions = await prisma.pagePermission.findMany({
      where: { pageId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      accessMode: access.page.accessMode,
      allowedUsers: permissions.map((permission) => permission.user),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("page.permissions.get", error);
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
    const access = await getPageAccessContext(user.id, pageId);

    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canManage || !access.member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`perms-update:${user.id}`, 20, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const accessMode = normalizeAccessMode(body.accessMode);
    if (!accessMode) {
      return NextResponse.json(
        { error: "Invalid access mode" },
        { status: 400 }
      );
    }

    const rawUserIds: unknown[] = Array.isArray(body.userIds)
      ? body.userIds
      : [];
    let allowedUserIds = rawUserIds.filter(
      (value): value is string => typeof value === "string"
    );

    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: access.page.workspaceId },
      select: { userId: true, role: true },
    });

    const memberById = new Map(
      workspaceMembers.map((member) => [member.userId, member.role])
    );

    allowedUserIds = [...new Set(allowedUserIds)].filter((userId) =>
      memberById.has(userId)
    );

    if (accessMode === "restricted") {
      if (!["owner", "admin"].includes(access.member.role)) {
        allowedUserIds = [...new Set([...allowedUserIds, user.id])];
      }
    } else {
      allowedUserIds = [];
    }

    await prisma.$transaction(async (tx) => {
      await tx.page.update({
        where: { id: pageId },
        data: { accessMode },
      });

      await tx.pagePermission.deleteMany({ where: { pageId } });

      if (allowedUserIds.length > 0) {
        await tx.pagePermission.createMany({
          data: allowedUserIds.map((userId) => ({ pageId, userId })),
          skipDuplicates: true,
        });
      }
    });

    const allowedUsers = await prisma.user.findMany({
      where: { id: { in: allowedUserIds } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    await recordAuditLog({
      action: "page.permissions.updated",
      actor: createAuditActor(user, access.member.role),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: {
        accessMode,
        allowedUserCount: allowedUserIds.length,
      },
      context: requestContext,
    });

    return NextResponse.json({
      accessMode,
      allowedUsers,
    });
  } catch (error) {
    logError("page.permissions.update_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
