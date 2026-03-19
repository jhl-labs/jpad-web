import { describe, it, expect } from "bun:test";
import { mock } from "bun:test";

// ai.ts가 여러 모듈을 import하므로 mock 처리
mock.module("@/lib/prisma", () => ({ prisma: {} }));
mock.module("@/lib/auth/helpers", () => ({
  checkWorkspaceAccess: async () => null,
}));
mock.module("@/lib/pageAccess", () => ({
  getPageAccessContext: async () => null,
}));
mock.module("@/lib/llmProviders", () => ({
  completeWithProfile: async () => "",
  streamWithProfile: async () => null,
  resolveAiProfileRuntime: () => ({}),
}));
mock.module("@/lib/aiSettings", () => ({
  resolveAiProfileForTask: () => null,
}));
mock.module("@/lib/workspaceSettings", () => ({
  getEffectiveWorkspaceSettings: async () => ({ aiProfiles: [], aiTaskRouting: {} }),
}));

const { AiError } = await import("@/lib/ai");

describe("AiError", () => {
  it("Error를 상속한다", () => {
    const err = new AiError("test error");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AiError);
  });

  it("메시지를 올바르게 설정한다", () => {
    const err = new AiError("Not found");
    expect(err.message).toBe("Not found");
  });

  it("기본 status는 400이다", () => {
    const err = new AiError("Bad request");
    expect(err.status).toBe(400);
  });

  it("커스텀 status를 설정할 수 있다", () => {
    const err = new AiError("Not found", 404);
    expect(err.status).toBe(404);
  });

  it("403 Forbidden 에러를 생성할 수 있다", () => {
    const err = new AiError("Forbidden", 403);
    expect(err.message).toBe("Forbidden");
    expect(err.status).toBe(403);
  });

  it("500 에러를 생성할 수 있다", () => {
    const err = new AiError("Internal error", 500);
    expect(err.status).toBe(500);
  });
});
