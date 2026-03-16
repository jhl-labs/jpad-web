import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { z } from "zod";

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  content: z.string().min(1).optional(),
  category: z.enum(["meeting", "project", "journal", "custom"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, templateId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`templates:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const template = await prisma.pageTemplate.findFirst({
      where: { id: templateId, workspaceId },
    });
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (template.isBuiltIn) {
      return NextResponse.json(
        { error: "기본 제공 템플릿은 수정할 수 없습니다" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const updated = await prisma.pageTemplate.update({
      where: { id: templateId },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("templates.patch.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId, templateId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`templates:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const template = await prisma.pageTemplate.findFirst({
      where: { id: templateId, workspaceId },
    });
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (template.isBuiltIn) {
      return NextResponse.json(
        { error: "기본 제공 템플릿은 삭제할 수 없습니다" },
        { status: 403 }
      );
    }

    await prisma.pageTemplate.delete({ where: { id: templateId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("templates.delete.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
