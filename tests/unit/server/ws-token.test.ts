import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";

// ⚠️ 이 테스트는 서버 로직(src/server/ws.ts)의 복제입니다.
// ws.ts는 모듈 로드 시 Redis/WebSocketServer를 즉시 초기화하므로 직접 import가 불가합니다.
// ws.ts의 validateToken / timingSafeEqual 로직이 변경되면 이 테스트도 동기화해야 합니다.

const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

interface TokenPayload {
  userId: string;
  workspaceId: string;
  pageId: string;
  canEdit: boolean;
  timestamp: number;
}

interface TokenValidationResult {
  valid: boolean;
  canEdit: boolean;
}

function signToken(payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function validateToken(token: string, docName: string, secret: string): TokenValidationResult {
  const fail: TokenValidationResult = { valid: false, canEdit: false };
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return fail;

    const [data, sig] = parts;
    const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");

    if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
      return fail;
    }

    const payload: TokenPayload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    );

    const now = Date.now();
    if (Math.abs(now - payload.timestamp) > TOKEN_MAX_AGE_MS) {
      return fail;
    }

    const [roomWorkspaceId, roomPageId] = docName.split(":");
    if (payload.workspaceId !== roomWorkspaceId) return fail;
    if (payload.pageId !== roomPageId) return fail;

    return { valid: true, canEdit: payload.canEdit !== false };
  } catch {
    return fail;
  }
}

describe("WS token - signToken & validateToken", () => {
  const secret = "test-ws-secret-key";

  it("유효한 토큰 생성 및 검증 성공", () => {
    const payload: TokenPayload = {
      userId: "user-1",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: true,
      timestamp: Date.now(),
    };

    const token = signToken(payload, secret);
    const result = validateToken(token, "ws-1:page-1", secret);

    expect(result.valid).toBe(true);
    expect(result.canEdit).toBe(true);
  });

  it("canEdit: false 토큰 검증", () => {
    const payload: TokenPayload = {
      userId: "user-2",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: false,
      timestamp: Date.now(),
    };

    const token = signToken(payload, secret);
    const result = validateToken(token, "ws-1:page-1", secret);

    expect(result.valid).toBe(true);
    expect(result.canEdit).toBe(false);
  });

  it("만료된 토큰 검증 실패", () => {
    const payload: TokenPayload = {
      userId: "user-1",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: true,
      timestamp: Date.now() - TOKEN_MAX_AGE_MS - 1000, // 만료
    };

    const token = signToken(payload, secret);
    const result = validateToken(token, "ws-1:page-1", secret);

    expect(result.valid).toBe(false);
  });

  it("잘못된 서명 검증 실패", () => {
    const payload: TokenPayload = {
      userId: "user-1",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: true,
      timestamp: Date.now(),
    };

    const token = signToken(payload, secret);
    // 서명 부분 변조
    const [data] = token.split(".");
    const tamperedToken = `${data}.invalidsignature`;

    const result = validateToken(tamperedToken, "ws-1:page-1", secret);
    expect(result.valid).toBe(false);
  });

  it("다른 시크릿으로 서명된 토큰 검증 실패", () => {
    const payload: TokenPayload = {
      userId: "user-1",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: true,
      timestamp: Date.now(),
    };

    const token = signToken(payload, "different-secret");
    const result = validateToken(token, "ws-1:page-1", secret);

    expect(result.valid).toBe(false);
  });

  it("workspace mismatch 검증 실패", () => {
    const payload: TokenPayload = {
      userId: "user-1",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: true,
      timestamp: Date.now(),
    };

    const token = signToken(payload, secret);
    const result = validateToken(token, "ws-WRONG:page-1", secret);

    expect(result.valid).toBe(false);
  });

  it("page mismatch 검증 실패", () => {
    const payload: TokenPayload = {
      userId: "user-1",
      workspaceId: "ws-1",
      pageId: "page-1",
      canEdit: true,
      timestamp: Date.now(),
    };

    const token = signToken(payload, secret);
    const result = validateToken(token, "ws-1:page-WRONG", secret);

    expect(result.valid).toBe(false);
  });

  it("잘못된 토큰 형식 검증 실패", () => {
    expect(validateToken("not-a-valid-token", "ws:page", secret).valid).toBe(false);
    expect(validateToken("", "ws:page", secret).valid).toBe(false);
    expect(validateToken("a.b.c", "ws:page", secret).valid).toBe(false);
  });
});

describe("WS token - timingSafeEqual", () => {
  it("같은 문자열은 true를 반환한다", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("다른 문자열은 false를 반환한다", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("a", "b")).toBe(false);
  });
});
