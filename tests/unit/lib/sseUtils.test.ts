import { describe, it, expect } from "bun:test";
import { parseSSEStream } from "@/lib/sseUtils";

/** 텍스트 청크 배열로 ReadableStream을 만드는 헬퍼 */
function makeResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

async function collectAll(gen: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const value of gen) {
    results.push(value);
  }
  return results;
}

describe("parseSSEStream", () => {
  it("정상 SSE 데이터 파싱", async () => {
    const response = makeResponse([
      'data: {"text":"Hello"}\n',
      'data: {"text":" World"}\n',
    ]);
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual(["Hello", " World"]);
  });

  it("여러 줄이 하나의 청크에 포함된 경우", async () => {
    const response = makeResponse([
      'data: {"text":"a"}\ndata: {"text":"b"}\n',
    ]);
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual(["a", "b"]);
  });

  it("text 필드 없는 데이터는 무시", async () => {
    const response = makeResponse([
      'data: {"id":"123"}\n',
      'data: {"text":"visible"}\n',
    ]);
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual(["visible"]);
  });

  it("data: 접두사 없는 줄은 무시", async () => {
    const response = makeResponse([
      ": comment\n",
      'data: {"text":"ok"}\n',
      "event: done\n",
    ]);
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual(["ok"]);
  });

  it("에러 이벤트 시 예외 throw", async () => {
    const response = makeResponse([
      'data: {"text":"start"}\n',
      'data: {"error":"something went wrong"}\n',
    ]);
    const gen = parseSSEStream(response);
    const first = await gen.next();
    expect(first.value).toBe("start");
    expect(gen.next()).rejects.toThrow("something went wrong");
  });

  it("불완전 JSON 청크는 무시 (에러 아닌 경우)", async () => {
    const response = makeResponse([
      'data: {"text":"hel',
      'lo"}\n',
      'data: {"text":"ok"}\n',
    ]);
    // 첫 번째 청크는 불완전한 JSON이므로 무시됨
    // 두 번째 청크 'lo"}\n'도 data: 접두사 없으므로 무시
    // 세 번째만 파싱됨
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual(["ok"]);
  });

  it("body가 null인 Response 처리", async () => {
    const response = new Response(null);
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual([]);
  });

  it("빈 스트림 처리", async () => {
    const response = makeResponse([]);
    const results = await collectAll(parseSSEStream(response));
    expect(results).toEqual([]);
  });
});
