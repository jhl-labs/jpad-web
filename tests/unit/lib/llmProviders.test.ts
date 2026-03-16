import { describe, it, expect, mock } from "bun:test";
import { buildDefaultAiProfile, type WorkspaceAiProfile } from "@/lib/aiConfig";

// Mock secrets module to avoid encryption dependencies (used transitively by aiSettings)
mock.module("@/lib/secrets", () => ({
  encryptSecret: (value: string) => `encrypted:${value}`,
  decryptSecret: (value: string | null) =>
    value?.startsWith("encrypted:") ? value.slice(10) : null,
}));

const {
  resolveAiProfileRuntime,
  supportsEmbeddings,
  completeWithProfile,
} = await import("@/lib/llmProviders");

function makeProfile(overrides: Partial<WorkspaceAiProfile> = {}): WorkspaceAiProfile {
  return buildDefaultAiProfile({
    id: "test-profile",
    name: "Test",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKey: "sk-test-key",
    ...overrides,
  });
}

describe("llmProviders", () => {
  describe("resolveAiProfileRuntime", () => {
    it("유효한 설정으로 프로필 초기화", () => {
      const profile = makeProfile({ apiKey: "sk-test" });
      const runtime = resolveAiProfileRuntime(profile);

      expect(runtime.provider).toBe("anthropic");
      expect(runtime.model).toBe("claude-sonnet-4-20250514");
      expect(runtime.baseUrl).toBe("https://api.anthropic.com");
    });

    it("API 키가 없는 경우 null 반환", () => {
      const profile = makeProfile({ apiKey: null });
      const runtime = resolveAiProfileRuntime(profile);

      expect(runtime.apiKey).toBeNull();
    });

    it("커스텀 baseUrl이 있으면 그대로 사용", () => {
      const profile = makeProfile({ baseUrl: "https://custom.api.com" });
      const runtime = resolveAiProfileRuntime(profile);

      expect(runtime.baseUrl).toBe("https://custom.api.com");
    });
  });

  describe("supportsEmbeddings", () => {
    it("anthropic은 임베딩을 지원하지 않음", () => {
      const profile = makeProfile({ provider: "anthropic" });
      expect(supportsEmbeddings(profile)).toBe(false);
    });

    it("openai는 임베딩 지원", () => {
      const profile = makeProfile({ provider: "openai" });
      expect(supportsEmbeddings(profile)).toBe(true);
    });

    it("gemini는 임베딩 지원", () => {
      const profile = makeProfile({ provider: "gemini" });
      expect(supportsEmbeddings(profile)).toBe(true);
    });

    it("ollama는 임베딩 지원", () => {
      const profile = makeProfile({ provider: "ollama" });
      expect(supportsEmbeddings(profile)).toBe(true);
    });
  });

  describe("completeWithProfile", () => {
    it("지원하지 않는 provider 타입은 에러 발생", async () => {
      const profile = makeProfile({ provider: "unknown" as any });

      await expect(
        completeWithProfile(profile, {
          systemPrompt: "test",
          userMessage: "hello",
        })
      ).rejects.toThrow("Unsupported AI provider");
    });
  });
});
