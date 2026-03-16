import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { recordAuditLog, createAuditActor, getAuditRequestContext } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { z } from "zod";

const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  completed: z.boolean().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  pageId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; todoId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, todoId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.todo.findFirst({
      where: { id: todoId, workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateTodoSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const data: Record<string, unknown> = { ...parsed.data };

    // assigneeId 변경 시 워크스페이스 멤버 검증
    if ("assigneeId" in data && data.assigneeId) {
      const assigneeMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: data.assigneeId as string },
      });
      if (!assigneeMember) {
        return NextResponse.json(
          { error: "Assignee is not a workspace member" },
          { status: 400 }
        );
      }
    }

    // Handle dueDate conversion
    if ("dueDate" in data) {
      data.dueDate = data.dueDate ? new Date(data.dueDate as string) : null;
    }

    // Handle completedAt when toggling completed
    if (typeof data.completed === "boolean") {
      data.completedAt = data.completed ? new Date() : null;
    }

    const todo = await prisma.todo.update({
      where: { id: todoId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
    });

    await recordAuditLog({
      action: "todo.update",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: todoId,
      targetType: "todo",
      metadata: { updatedFields: Object.keys(parsed.data) },
      context: getAuditRequestContext(req),
    });

    return NextResponse.json(todo);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("todos.patch.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; todoId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, todoId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.todo.findFirst({
      where: { id: todoId, workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.todo.delete({ where: { id: todoId } });

    await recordAuditLog({
      action: "todo.delete",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: todoId,
      targetType: "todo",
      metadata: { title: existing.title },
      context: getAuditRequestContext(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("todos.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
