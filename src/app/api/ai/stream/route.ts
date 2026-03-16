import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { aiStreamText, AI_PROMPTS, AiError, resolveAiWorkspaceContext } from "@/lib/ai";
import { readPage } from "@/lib/git/repository";
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
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`ai-stream:${user.id}`, 20, 60_000))) {
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

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of aiStreamText(
            context.workspaceId,
            systemPrompt,
            text,
            2048,
            "write"
          )) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          logError("ai.stream.chunk_error", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError("ai.stream.error", error);
    return NextResponse.json(
      { error: "Stream processing failed" },
      { status: 500 }
    );
  }
}
