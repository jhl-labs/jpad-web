import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { AiError, aiStreamText, resolveAiWorkspaceContext } from "@/lib/ai";
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

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let accumulated = "";
          let isThinking = false;

          for await (const chunk of aiStreamText(
            context.workspaceId,
            SYSTEM_PROMPT,
            userMessage,
            1500,
            "autocomplete"
          )) {
            accumulated += chunk;

            // 초기 50자 이내에 thinking 패턴 감지
            if (accumulated.length < 60 && !isThinking) {
              if (/^(Thinking Process|<think>|\*\*Analyze|The user)/i.test(accumulated.trim())) {
                isThinking = true;
                continue;
              }
            }

            if (isThinking) {
              // thinking 중 — 수집만, 전송 안 함
              continue;
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }

          // thinking 모델이었으면 전체에서 답변 추출 후 전송
          if (isThinking && accumulated) {
            // 동적 import 대신 간단한 추출
            const markers = [/\*\s*(Revised|Final Version|Final Output):\s*\n/i];
            let answer = "";
            for (const marker of markers) {
              const match = accumulated.search(marker);
              if (match >= 0) {
                const m = accumulated.slice(match).match(marker);
                if (m) {
                  answer = accumulated.slice(match + m[0].length).trim();
                  break;
                }
              }
            }
            // CJK 블록 fallback
            if (!answer) {
              const cjkBlocks = accumulated.match(/[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF].{50,}/g);
              if (cjkBlocks) {
                answer = cjkBlocks.reduce((a, b) => a.length >= b.length ? a : b);
                const idx = accumulated.lastIndexOf(answer);
                if (idx > 0) answer = accumulated.slice(idx).trim();
              }
            }
            if (answer) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: answer })}\n\n`)
              );
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          logError("ai.autocomplete.stream_error", error);
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
    logError("ai.autocomplete.failed", error, {}, req);
    return NextResponse.json(
      { error: "Autocomplete generation failed" },
      { status: 500 }
    );
  }
}
