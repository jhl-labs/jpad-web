import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { aiComplete, AiError, resolveAiWorkspaceContext } from "@/lib/ai";
import { readPage } from "@/lib/git/repository";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

const MAX_SOURCE_LENGTH = 8000;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);

    if (!(await rateLimitRedis(`ai-autocomplete:${user.id}`, 20, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as {
      workspaceId?: string;
      pageId?: string;
      text?: string;
    };

    const context = await resolveAiWorkspaceContext(user.id, {
      workspaceId: body.workspaceId,
      pageId: body.pageId,
    });

    let text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text && context.page) {
      text = (await readPage(context.workspaceId, context.page.slug))?.trim() || "";
    }
    if (!text) {
      return NextResponse.json(
        { error: "text or pageId with readable content is required" },
        { status: 400 }
      );
    }

    const excerpt = text.slice(-MAX_SOURCE_LENGTH);
    const result = await aiComplete(
      context.workspaceId,
      [
        "You continue collaborative markdown documents.",
        "Continue naturally from the end of the document.",
        "Keep the same language, structure, and tone.",
        "Do not repeat the full input.",
        "Output only the continuation in markdown.",
      ].join(" "),
      `Continue this document from where it ends:\n\n${excerpt}`,
      768,
      "autocomplete"
    );

    await recordAuditLog({
      action: "ai.autocomplete.completed",
      actor: createAuditActor(user),
      workspaceId: context.workspaceId,
      pageId: context.page?.id ?? null,
      targetType: "ai",
      metadata: {
        inputLength: excerpt.length,
      },
      context: requestContext,
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError("ai.autocomplete.failed", error, {}, req);
    return NextResponse.json(
      { error: "Autocomplete generation failed" },
      { status: 500 }
    );
  }
}
