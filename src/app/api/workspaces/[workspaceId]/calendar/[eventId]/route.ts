import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { recordAuditLog, createAuditActor, getAuditRequestContext } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; eventId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, eventId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("calendar-event.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; eventId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, eventId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`calendar-event:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      if (body.title.length > 500) {
        return NextResponse.json(
          { error: "Title must be 500 characters or less" },
          { status: 400 }
        );
      }
      updateData.title = body.title;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 5000) {
        return NextResponse.json(
          { error: "Description must be 5000 characters or less" },
          { status: 400 }
        );
      }
      updateData.description = body.description;
    } else if (body.description === null) {
      updateData.description = body.description;
    }
    if (body.startAt) updateData.startAt = new Date(body.startAt);
    if (body.endAt !== undefined)
      updateData.endAt = body.endAt ? new Date(body.endAt) : null;
    if (typeof body.allDay === "boolean") updateData.allDay = body.allDay;
    if (typeof body.color === "string") {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) {
        return NextResponse.json(
          { error: "color must be a valid hex color (e.g. #3b82f6)" },
          { status: 400 }
        );
      }
      updateData.color = body.color;
    }
    if (typeof body.location === "string") {
      if (body.location.length > 500) {
        return NextResponse.json(
          { error: "Location must be 500 characters or less" },
          { status: 400 }
        );
      }
      updateData.location = body.location;
    } else if (body.location === null) {
      updateData.location = body.location;
    }
    if (typeof body.recurrence === "string" || body.recurrence === null) {
      if (typeof body.recurrence === "string" && body.recurrence.length > 500) {
        return NextResponse.json(
          { error: "Recurrence must be 500 characters or less" },
          { status: 400 }
        );
      }
      updateData.recurrence = body.recurrence;
    }
    if (typeof body.pageId === "string" || body.pageId === null)
      updateData.pageId = body.pageId;

    // pageId가 워크스페이스에 속하는지 검증
    if (typeof updateData.pageId === "string") {
      const page = await prisma.page.findFirst({
        where: { id: updateData.pageId as string, workspaceId, isDeleted: false },
      });
      if (!page) {
        return NextResponse.json(
          { error: "Page not found in this workspace" },
          { status: 400 }
        );
      }
    }

    // startAt 유효성 검증
    if (updateData.startAt && isNaN((updateData.startAt as Date).getTime())) {
      return NextResponse.json(
        { error: "Invalid start date" },
        { status: 400 }
      );
    }

    // endAt 유효성 검증
    if (updateData.endAt !== undefined && updateData.endAt !== null && isNaN((updateData.endAt as Date).getTime())) {
      return NextResponse.json(
        { error: "Invalid end date" },
        { status: 400 }
      );
    }

    const event = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
    });

    await recordAuditLog({
      action: "calendar_event.update",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: eventId,
      targetType: "calendarEvent",
      metadata: { updatedFields: Object.keys(updateData) },
      context: getAuditRequestContext(req),
    });

    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("calendar-event.patch.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; eventId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, eventId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`calendar-event:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.calendarEvent.delete({ where: { id: eventId } });

    await recordAuditLog({
      action: "calendar_event.delete",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetId: eventId,
      targetType: "calendarEvent",
      metadata: { title: existing.title },
      context: getAuditRequestContext(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("calendar-event.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
