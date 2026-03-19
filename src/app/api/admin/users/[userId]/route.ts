import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { recordAuditLog, createAuditActor } from "@/lib/audit";

// DELETE — 사용자 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { userId } = await params;

    if (userId === admin.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isPlatformAdmin: true },
    });

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.isPlatformAdmin) {
      return NextResponse.json({ error: "Cannot delete a platform admin" }, { status: 403 });
    }

    await prisma.user.delete({ where: { id: userId } });

    await recordAuditLog({
      action: "platform.user.deleted",
      actor: createAuditActor(admin, "platform_admin"),
      targetId: target.id,
      targetType: "user",
      metadata: { email: target.email, name: target.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logError("admin.users.delete", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — 사용자 관리자 권한 변경
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { userId } = await params;
    const body = await req.json();

    if (userId === admin.id) {
      return NextResponse.json({ error: "Cannot modify yourself" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data: { isPlatformAdmin?: boolean } = {};
    if (typeof body.isPlatformAdmin === "boolean") {
      data.isPlatformAdmin = body.isPlatformAdmin;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, isPlatformAdmin: true },
    });

    await recordAuditLog({
      action: "platform.user.updated",
      actor: createAuditActor(admin, "platform_admin"),
      targetId: target.id,
      targetType: "user",
      metadata: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logError("admin.users.update", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
