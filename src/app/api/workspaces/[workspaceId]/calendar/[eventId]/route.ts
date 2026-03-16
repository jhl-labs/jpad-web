import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { recordAuditLog, createAuditActor, getAuditRequestContext } from "@/lib/audit";

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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
          { error: "제목은 500자 이하여야 합니다." },
          { status: 400 }
        );
      }
      updateData.title = body.title;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 5000) {
        return NextResponse.json(
          { error: "설명은 5000자 이하여야 합니다." },
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
    if (typeof body.color === "string") updateData.color = body.color;
    if (typeof body.location === "string") {
      if (body.location.length > 500) {
        return NextResponse.json(
          { error: "위치는 500자 이하여야 합니다." },
          { status: 400 }
        );
      }
      updateData.location = body.location;
    } else if (body.location === null) {
      updateData.location = body.location;
    }
    if (typeof body.recurrence === "string" || body.recurrence === null)
      updateData.recurrence = body.recurrence;
    if (typeof body.pageId === "string" || body.pageId === null)
      updateData.pageId = body.pageId;

    const event = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
    });

    return NextResponse.json(event);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
