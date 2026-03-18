import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { rateLimitRedis } from "@/lib/rateLimit";
import { handleApiError } from "@/lib/apiErrorHandler";

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

    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") || "500", 10) || 500));

    // 날짜 파라미터 유효성 검증
    if (start && isNaN(new Date(start).getTime())) {
      return NextResponse.json(
        { error: "Invalid start date" },
        { status: 400 }
      );
    }
    if (end && isNaN(new Date(end).getTime())) {
      return NextResponse.json(
        { error: "Invalid end date" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { workspaceId };

    if (start || end) {
      where.startAt = {};
      if (start) {
        (where.startAt as Record<string, unknown>).gte = new Date(start);
      }
      if (end) {
        (where.startAt as Record<string, unknown>).lte = new Date(end);
      }
    } else {
      // 날짜 범위 없이 호출 시 최근 6개월로 기본값 설정
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      where.startAt = { gte: sixMonthsAgo };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { startAt: "asc" },
      take: limit,
    });

    return NextResponse.json(events);
  } catch (error) {
    return handleApiError(error, "calendar.get.unhandled_error");
  }
}

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
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowed = await rateLimitRedis(`calendar:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { title, description, startAt, endAt, allDay, color, location, recurrence, pageId } = body;

    if (!title || typeof title !== "string" || !startAt) {
      return NextResponse.json(
        { error: "Title and start time are required" },
        { status: 400 }
      );
    }

    // Validate date parsing
    if (isNaN(new Date(startAt).getTime())) {
      return NextResponse.json(
        { error: "Invalid startAt date" },
        { status: 400 }
      );
    }
    if (endAt && isNaN(new Date(endAt).getTime())) {
      return NextResponse.json(
        { error: "Invalid endAt date" },
        { status: 400 }
      );
    }

    // 입력 길이 검증
    if (title.length > 500) {
      return NextResponse.json(
        { error: "Title must be 500 characters or less" },
        { status: 400 }
      );
    }
    if (typeof description === "string" && description.length > 5000) {
      return NextResponse.json(
        { error: "Description must be 5000 characters or less" },
        { status: 400 }
      );
    }
    if (typeof location === "string" && location.length > 500) {
      return NextResponse.json(
        { error: "Location must be 500 characters or less" },
        { status: 400 }
      );
    }

    if (color !== undefined && color !== null) {
      if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return NextResponse.json(
          { error: "color must be a valid hex color (e.g. #3b82f6)" },
          { status: 400 }
        );
      }
    }

    // pageId가 워크스페이스에 속하는지 검증
    if (pageId) {
      const page = await prisma.page.findFirst({
        where: { id: pageId, workspaceId, isDeleted: false },
      });
      if (!page) {
        return NextResponse.json(
          { error: "Page not found in this workspace" },
          { status: 400 }
        );
      }
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title,
        description: description || null,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        allDay: allDay || false,
        color: color || "#3b82f6",
        location: location || null,
        recurrence: recurrence || null,
        pageId: pageId || null,
        workspaceId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
    });

    await recordAuditLog({
      action: "calendar.event.created",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: event.id,
      targetType: "calendar_event",
      metadata: {
        title: event.title,
        allDay: event.allDay,
      },
      context: requestContext,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError(error, "calendar.post.unhandled_error");
  }
}
