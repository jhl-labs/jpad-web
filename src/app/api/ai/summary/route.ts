import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { readPage } from "@/lib/git/repository";
import { aiComplete, AI_PROMPTS, AiError, resolveAiWorkspaceContext } from "@/lib/ai";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);

    if (!(await rateLimitRedis(`ai-summary:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { pageId } = (await req.json()) as { pageId: string };

    if (!pageId) {
      return NextResponse.json(
        { error: "pageId is required" },
        { status: 400 }
      );
    }

    const context = await resolveAiWorkspaceContext(user.id, { pageId });
    if (!context.page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const content = await readPage(context.workspaceId, context.page.slug);
    if (!content) {
      return NextResponse.json(
        { error: "Page content not found" },
        { status: 404 }
      );
    }

    const lang = "한국어";
    const summary = await aiComplete(
      context.workspaceId,
      AI_PROMPTS.summarize(lang),
      content,
      2048,
      "summary"
    );

    await prisma.page.update({
      where: { id: pageId },
      data: { summary },
    });

    await recordAuditLog({
      action: "ai.summary.completed",
      actor: createAuditActor(user),
      workspaceId: context.workspaceId,
      pageId,
      targetType: "ai",
      context: requestContext,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError("ai.summary.failed", error, {}, req);
    return NextResponse.json(
      { error: "Summary generation failed" },
      { status: 500 }
    );
  }
}
