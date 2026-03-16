import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { rateLimitRedis } from "@/lib/rateLimit";
import { z } from "zod";

const createTodoSchema = z.object({
  title: z.string().min(1, "제목은 필수입니다").max(500, "제목은 500자 이하여야 합니다"),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  pageId: z.string().optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = req.nextUrl;
    const completedParam = url.searchParams.get("completed");
    const assignee = url.searchParams.get("assignee");
    const priority = url.searchParams.get("priority");
    const pageId = url.searchParams.get("pageId");

    const where: Record<string, unknown> = { workspaceId };

    if (completedParam !== null) {
      where.completed = completedParam === "true";
    }
    if (assignee) {
      where.assigneeId = assignee;
    }
    if (priority) {
      where.priority = priority;
    }
    if (pageId) {
      where.pageId = pageId;
    }

    const todos = await prisma.todo.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
      orderBy: [{ completed: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const total = todos.length;
    const completedCount = todos.filter((t) => t.completed).length;

    return NextResponse.json({ todos, total, completedCount });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createTodoSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const allowed = await rateLimitRedis(`todos:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { title, description, priority, dueDate, assigneeId, pageId } = parsed.data;

    // assigneeId가 워크스페이스 멤버인지 검증
    if (assigneeId) {
      const assigneeMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: assigneeId },
      });
      if (!assigneeMember) {
        return NextResponse.json(
          { error: "담당자가 워크스페이스 멤버가 아닙니다." },
          { status: 400 }
        );
      }
    }

    // Get max sortOrder
    const maxSort = await prisma.todo.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });

    const todo = await prisma.todo.create({
      data: {
        title,
        description: description || null,
        priority: priority || "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId: assigneeId || null,
        pageId: pageId || null,
        workspaceId,
        createdById: user.id,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
