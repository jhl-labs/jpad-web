import { describe, it, expect, mock } from "bun:test";

// apiErrorHandler.ts의 의존성 mock
// IMPORTANT: @/lib/aiSettings, @/lib/pageAccess, @/lib/secrets는 mock하지 않음
// (다른 테스트 파일에서 실제 모듈이 필요하므로 전역 mock 오염 방지)
mock.module("@/lib/logger", () => ({
  logError: () => {},
  logWarn: () => {},
  logInfo: () => {},
  logRequest: () => {},
}));
mock.module("@/lib/prisma", () => ({ prisma: {} }));
mock.module("@/lib/auth/helpers", () => ({
  checkWorkspaceAccess: async () => null,
  requireAuth: async () => { throw new Error("Unauthorized"); },
  getCurrentUser: async () => null,
  getPlatformAdminEmails: () => [],
  isPlatformAdminEmail: () => false,
}));
mock.module("@/lib/llmProviders", () => ({
  completeWithProfile: async () => "",
  streamWithProfile: async () => null,
  resolveAiProfileRuntime: () => ({}),
  supportsEmbeddings: () => false,
}));
mock.module("@/lib/workspaceSettings", () => ({
  getEffectiveWorkspaceSettings: async () => ({
    aiEnabled: true, aiModel: "claude-sonnet-4-20250514", aiApiKey: null,
    aiMaxTokens: 2048, aiProfiles: [], aiTaskRouting: {
      general: null, write: null, chat: null, summary: null,
      autocomplete: null, embedding: null,
    },
    allowPublicPages: true, allowMemberInvite: true,
    defaultPageAccess: "workspace", maxFileUploadMb: 10,
    uploadDlpScanMode: null, uploadDlpDetectors: null,
    uploadDlpMaxExtractedCharacters: null,
  }),
  DEFAULT_WORKSPACE_SETTINGS: {
    aiEnabled: true, aiModel: "claude-sonnet-4-20250514", aiApiKey: null,
    aiMaxTokens: 2048, aiProfiles: [], aiTaskRouting: {
      general: null, write: null, chat: null, summary: null,
      autocomplete: null, embedding: null,
    },
    allowPublicPages: true, allowMemberInvite: true,
    defaultPageAccess: "workspace", maxFileUploadMb: 10,
    uploadDlpScanMode: null, uploadDlpDetectors: null,
    uploadDlpMaxExtractedCharacters: null,
  },
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
