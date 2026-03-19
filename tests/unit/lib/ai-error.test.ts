import { describe, it, expect } from "bun:test";
import { mock } from "bun:test";

// ai.ts가 여러 모듈을 import하므로 mock 처리
// IMPORTANT: @/lib/aiSettings, @/lib/pageAccess, @/lib/secrets는 mock하지 않음
// (다른 테스트 파일에서 실제 모듈이 필요하므로 전역 mock 오염 방지)
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
