import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { recordAuditLog, createAuditActor } from "@/lib/audit";
import { rateLimitRedis } from "@/lib/rateLimit";

// DELETE — 워크스페이스 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { workspaceId } = await params;

    const allowed = await rateLimitRedis(`admin.workspace.delete:${admin.id}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    await prisma.workspace.delete({ where: { id: workspaceId } });

    await recordAuditLog({
      action: "platform.workspace.deleted",
      actor: createAuditActor(admin, "platform_admin"),
      targetId: workspace.id,
      targetType: "workspace",
      metadata: { name: workspace.name, slug: workspace.slug },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logError("admin.workspaces.delete", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
