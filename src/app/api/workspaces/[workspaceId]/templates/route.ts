import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { getBuiltInTemplates } from "@/lib/builtInTemplates";
import { z } from "zod";

const createTemplateSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다").max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  content: z.string().min(1, "내용은 필수입니다"),
  category: z.enum(["meeting", "project", "journal", "custom"]).default("custom"),
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

    const category = req.nextUrl.searchParams.get("category");

    const where: Record<string, unknown> = { workspaceId };
    if (category) {
      where.category = category;
    }

    const customTemplates = await prisma.pageTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    let builtIn = getBuiltInTemplates();
    if (category) {
      builtIn = builtIn.filter((t) => t.category === category);
    }

    return NextResponse.json({
      builtIn,
      custom: customTemplates,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
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

    const allowed = await rateLimitRedis(`templates:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const template = await prisma.pageTemplate.create({
      data: {
        ...parsed.data,
        workspaceId,
        createdById: user.id,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("templates.post.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
