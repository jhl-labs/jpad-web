import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { AiError, aiComplete, resolveAiWorkspaceContext } from "@/lib/ai";
import { readPage } from "@/lib/git/repository";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

const MAX_SOURCE_LENGTH = 8000;

const SYSTEM_PROMPT = [
  "당신은 협업 문서의 이어쓰기를 돕는 AI입니다.",
  "문서의 마지막 부분에서 자연스럽게 1~2 단락만 이어서 작성하세요.",
  "반드시 문서와 동일한 언어로 작성하세요. 한국어 문서면 한국어로, 영어 문서면 영어로.",
  "동일한 문체, 톤, 마크다운 구조를 유지하세요.",
  "입력 텍스트를 반복하지 마세요.",
  "이어쓰기 부분만 출력하세요. 짧고 간결하게.",
].join(" ");

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

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
    const userMessage = `다음 문서의 끝에서 이어서 작성하세요 (1~2 단락만):\n\n${excerpt}`;

    // 비스트리밍으로 깔끔한 응답을 받고 pseudo-streaming으로 전달
    // (Ollama cloud 모델은 스트리밍 시 reasoning 필드에 쓰레기 데이터 포함)
    const result = await aiComplete(
      context.workspaceId,
      SYSTEM_PROMPT,
      userMessage,
      1500,
      "autocomplete"
    );

    const cleanText = (result || "").trim();
    if (!cleanText) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 500 }
      );
    }

    // SSE pseudo-streaming: 깔끔한 텍스트를 작은 청크로 나눠 전달
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        const chunkSize = 12;
        let i = 0;

        function sendNext() {
          if (i >= cleanText.length) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          const chunk = cleanText.slice(i, i + chunkSize);
          i += chunkSize;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
          // 타이핑 효과를 위한 약간의 지연 (setImmediate 대신)
          setTimeout(sendNext, 30);
        }
        sendNext();
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
    logError("ai.autocomplete.failed", error, {}, req);
    return NextResponse.json(
      { error: "Autocomplete generation failed" },
      { status: 500 }
    );
  }
}
