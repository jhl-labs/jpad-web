import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock requestContext before importing logger
mock.module("@/lib/requestContext", () => ({
  getRequestContext: () => ({
    requestId: "test-request-id",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  }),
}));

const { logError, logInfo } = await import("@/lib/logger");

describe("logger", () => {
  let capturedError: string | undefined;
  let capturedWarn: string | undefined;
  let capturedLog: string | undefined;

  beforeEach(() => {
    capturedError = undefined;
    capturedWarn = undefined;
    capturedLog = undefined;

    console.error = mock((msg: string) => {
      capturedError = msg;
    }) as any;
    console.warn = mock((msg: string) => {
      capturedWarn = msg;
    }) as any;
    console.log = mock((msg: string) => {
      capturedLog = msg;
    }) as any;
  });

  describe("logError", () => {
    it("Error 객체로 올바른 구조화된 출력 생성", () => {
      const error = new Error("something broke");
      logError("test.error", error);

      expect(capturedError).toBeDefined();
      const parsed = JSON.parse(capturedError!);
      expect(parsed.level).toBe("error");
      expect(parsed.event).toBe("test.error");
      expect(parsed.errorName).toBe("Error");
      expect(parsed.errorMessage).toBe("something broke");
      expect(parsed.errorStack).toBeDefined();
      expect(parsed.requestId).toBe("test-request-id");
      expect(parsed.ipAddress).toBe("127.0.0.1");
      expect(parsed.timestamp).toBeDefined();
    });

    it("Error가 아닌 객체 처리", () => {
      logError("test.error", "string error");

      expect(capturedError).toBeDefined();
      const parsed = JSON.parse(capturedError!);
      expect(parsed.level).toBe("error");
      expect(parsed.error).toBe("string error");
      expect(parsed.errorName).toBeUndefined();
    });

    it("추가 필드가 포함된 에러 로깅", () => {
      logError("test.error", new Error("fail"), { userId: "u1", action: "save" });

      const parsed = JSON.parse(capturedError!);
      expect(parsed.userId).toBe("u1");
      expect(parsed.action).toBe("save");
      expect(parsed.errorMessage).toBe("fail");
    });
  });

  describe("logInfo", () => {
    it("올바른 구조화된 출력 생성", () => {
      logInfo("test.info", { key: "value" });

      expect(capturedLog).toBeDefined();
      const parsed = JSON.parse(capturedLog!);
      expect(parsed.level).toBe("info");
      expect(parsed.event).toBe("test.info");
      expect(parsed.key).toBe("value");
      expect(parsed.requestId).toBe("test-request-id");
      expect(parsed.timestamp).toBeDefined();
    });

    it("필드 없이 호출 시 기본 컨텍스트만 출력", () => {
      logInfo("test.simple");

      const parsed = JSON.parse(capturedLog!);
      expect(parsed.level).toBe("info");
      expect(parsed.event).toBe("test.simple");
      expect(parsed.requestId).toBe("test-request-id");
    });
  });
});
