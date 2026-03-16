import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { aiComplete, AI_PROMPTS, AiError, resolveAiWorkspaceContext } from "@/lib/ai";
import { readPage } from "@/lib/git/repository";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

type Action =
  | "summarize"
  | "expand"
  | "translate"
  | "fixGrammar"
  | "changeTone"
  | "explain"
  | "actionItems";

export async function POST(req: NextRequest) {
  let workspaceId: string | undefined;

  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);

    if (!(await rateLimitRedis(`ai-write:${user.id}`, 20, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as {
      action: Action;
      text?: string;
      workspaceId?: string;
      pageId?: string;
      language?: string;
      tone?: string;
      options?: { targetLang?: string; tone?: string };
    };
    const { action } = body;
    workspaceId = body.workspaceId;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

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

    const targetLang = body.options?.targetLang || body.language || "English";
    const tone = body.options?.tone || body.tone || "professional";

    const lang = "한국어";
    let systemPrompt: string;

    switch (action) {
      case "summarize":
        systemPrompt = AI_PROMPTS.summarize(lang);
        break;
      case "expand":
        systemPrompt = AI_PROMPTS.expand(lang);
        break;
      case "translate":
        systemPrompt = AI_PROMPTS.translate(targetLang);
        break;
      case "fixGrammar":
        systemPrompt = AI_PROMPTS.fixGrammar(lang);
        break;
      case "changeTone":
        systemPrompt = AI_PROMPTS.changeTone(tone, lang);
        break;
      case "explain":
        systemPrompt = AI_PROMPTS.explain(lang);
        break;
      case "actionItems":
        systemPrompt = AI_PROMPTS.actionItems(lang);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    const result = await aiComplete(
      context.workspaceId,
      systemPrompt,
      text,
      2048,
      "write"
    );

    await recordAuditLog({
      action: "ai.write.completed",
      actor: createAuditActor(user),
      workspaceId: context.workspaceId,
      pageId: context.page?.id ?? null,
      targetType: "ai",
      metadata: {
        action,
        usedPageContext: Boolean(context.page),
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
    logError("ai.write.failed", error, { workspaceId }, req);
    return NextResponse.json(
      { error: "AI processing failed" },
      { status: 500 }
    );
  }
}
