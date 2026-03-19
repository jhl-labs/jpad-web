import { describe, it, expect, mock } from "bun:test";

// requestContext.ts가 rateLimit의 extractClientIp를 import하므로 mock
mock.module("@/lib/rateLimit", () => ({
  extractClientIp: (headers: Headers | null) => {
    if (!headers) return "";
    return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  },
}));

const { getHeaders, getRequestId, getRequestContext } = await import(
  "@/lib/requestContext"
);

describe("getHeaders", () => {
  it("null 입력에 null을 반환한다", () => {
    expect(getHeaders(null)).toBeNull();
  });

  it("undefined 입력에 null을 반환한다", () => {
    expect(getHeaders(undefined)).toBeNull();
  });

  it("Headers 인스턴스를 그대로 반환한다", () => {
    const headers = new Headers({ "x-test": "value" });
    expect(getHeaders(headers)).toBe(headers);
  });

  it("Request 객체에서 headers를 추출한다", () => {
    const req = new Request("http://localhost", {
      headers: { "x-test": "value" },
    });
    const result = getHeaders(req);
    expect(result).toBeInstanceOf(Headers);
    expect(result?.get("x-test")).toBe("value");
  });
});

describe("getRequestId", () => {
  it("x-request-id 헤더가 있으면 그 값을 반환한다", () => {
    const headers = new Headers({ "x-request-id": "req-123" });
    expect(getRequestId(headers)).toBe("req-123");
  });

  it("x-vercel-id 헤더를 폴백으로 사용한다", () => {
    const headers = new Headers({ "x-vercel-id": "vercel-456" });
    expect(getRequestId(headers)).toBe("vercel-456");
  });

  it("x-request-id가 x-vercel-id보다 우선한다", () => {
    const headers = new Headers({
      "x-request-id": "req-123",
      "x-vercel-id": "vercel-456",
    });
    expect(getRequestId(headers)).toBe("req-123");
  });

  it("헤더가 없으면 UUID를 생성한다", () => {
    const headers = new Headers();
    const id = getRequestId(headers);
    // UUID v4 형식 확인
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("null 소스에 UUID를 생성한다", () => {
    const id = getRequestId(null);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("getRequestContext", () => {
  it("헤더에서 컨텍스트를 생성한다", () => {
    const headers = new Headers({
      "x-request-id": "req-789",
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestAgent/1.0",
    });
    const ctx = getRequestContext(headers);
    expect(ctx.requestId).toBe("req-789");
    expect(ctx.userAgent).toBe("TestAgent/1.0");
  });

  it("null 소스에 기본값을 반환한다", () => {
    const ctx = getRequestContext(null);
    expect(ctx.requestId).toBeTruthy();
    expect(ctx.userAgent).toBeNull();
  });
});
