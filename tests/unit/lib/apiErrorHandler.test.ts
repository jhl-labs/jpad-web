import { describe, it, expect, mock } from "bun:test";

// apiErrorHandler.ts의 의존성 mock
mock.module("@/lib/logger", () => ({
  logError: () => {},
  logWarn: () => {},
  logInfo: () => {},
}));
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

const { handleApiError } = await import("@/lib/apiErrorHandler");
const { AiError } = await import("@/lib/ai");

describe("handleApiError", () => {
  it("Unauthorized 에러에 401을 반환한다", async () => {
    const error = new Error("Unauthorized");
    const response = handleApiError(error, "test");
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("AiError에 해당 status를 반환한다", async () => {
    const error = new AiError("AI limit exceeded", 429);
    const response = handleApiError(error, "test");
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("AI limit exceeded");
  });

  it("AiError 404를 올바르게 반환한다", async () => {
    const error = new AiError("Not found", 404);
    const response = handleApiError(error, "test");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Not found");
  });

  it("일반 에러에 500을 반환한다", async () => {
    const error = new Error("Something went wrong");
    const response = handleApiError(error, "test");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Server error");
  });

  it("문자열 에러에 500을 반환한다", async () => {
    const response = handleApiError("string error", "test");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Server error");
  });

  it("null 에러에 500을 반환한다", async () => {
    const response = handleApiError(null, "test");
    expect(response.status).toBe(500);
  });
});
