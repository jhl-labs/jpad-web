import { describe, it, expect, mock } from "bun:test";
import {
  buildDefaultAiProfile,
  getAiProviderLabel,
  getAiTaskLabel,
  AI_PROVIDER_VALUES,
  AI_TASK_VALUES,
  type AiProviderType,
  type AiTaskType,
  type WorkspaceAiProfile,
  type WorkspaceAiTaskRouting,
} from "@/lib/aiConfig";

// Set encryption key so secrets module can load without mocking
if (!process.env.APP_ENCRYPTION_KEY) {
  process.env.APP_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
}

const { resolveAiProfileForTask } = await import("@/lib/aiSettings");

describe("aiConfig", () => {
  describe("buildDefaultAiProfile", () => {
    it("인자 없이 호출 시 기본값 반환", () => {
      const profile = buildDefaultAiProfile();
      expect(profile.id).toBe("legacy-anthropic");
      expect(profile.name).toBe("Default Anthropic");
      expect(profile.provider).toBe("anthropic");
      expect(profile.enabled).toBe(true);
      expect(profile.model).toBe("claude-sonnet-4-20250514");
      expect(profile.apiKey).toBeNull();
      expect(profile.baseUrl).toBeNull();
      expect(profile.maxTokens).toBe(2048);
      expect(profile.temperature).toBeNull();
      expect(profile.stop).toEqual([]);
    });

    it("overrides 적용", () => {
      const profile = buildDefaultAiProfile({
        id: "custom-id",
        provider: "openai",
        model: "gpt-4o",
        maxTokens: 4096,
        enabled: false,
      });
      expect(profile.id).toBe("custom-id");
      expect(profile.provider).toBe("openai");
      expect(profile.model).toBe("gpt-4o");
      expect(profile.maxTokens).toBe(4096);
      expect(profile.enabled).toBe(false);
      // 나머지는 기본값 유지
      expect(profile.name).toBe("Default Anthropic");
    });

    it("enabled: false를 0이 아닌 falsy 값으로 덮어씌우기", () => {
      const profile = buildDefaultAiProfile({ enabled: false });
      expect(profile.enabled).toBe(false);
    });
  });

  describe("getAiProviderLabel", () => {
    const expected: Record<AiProviderType, string> = {
      anthropic: "Anthropic",
      openai: "OpenAI",
      gemini: "Google Gemini",
      "openai-compatible": "OpenAI Compatible",
      ollama: "Ollama",
    };

    for (const provider of AI_PROVIDER_VALUES) {
      it(`"${provider}" → "${expected[provider]}"`, () => {
        expect(getAiProviderLabel(provider)).toBe(expected[provider]);
      });
    }
  });

  describe("getAiTaskLabel", () => {
    const expected: Record<AiTaskType, string> = {
      general: "일반 기본 모델",
      write: "문서 작성/변환",
      chat: "AI 채팅",
      summary: "요약",
      autocomplete: "자동 완성",
      embedding: "임베딩",
    };

    for (const task of AI_TASK_VALUES) {
      it(`"${task}" → "${expected[task]}"`, () => {
        expect(getAiTaskLabel(task)).toBe(expected[task]);
      });
    }
  });
});

describe("resolveAiProfileForTask", () => {
  function makeProfile(
    id: string,
    enabled = true,
    provider: AiProviderType = "anthropic"
  ): WorkspaceAiProfile {
    return buildDefaultAiProfile({ id, name: id, enabled, provider });
  }

  const emptyRouting: WorkspaceAiTaskRouting = {
    general: null,
    write: null,
    chat: null,
    summary: null,
    autocomplete: null,
    embedding: null,
  };

  it("태스크 라우팅에 지정된 프로필 반환", () => {
    const profiles = [makeProfile("a"), makeProfile("b")];
    const routing: WorkspaceAiTaskRouting = { ...emptyRouting, chat: "b" };
    const result = resolveAiProfileForTask(profiles, routing, "chat");
    expect(result?.id).toBe("b");
  });

  it("태스크 라우팅 없으면 general 폴백", () => {
    const profiles = [makeProfile("a"), makeProfile("b")];
    const routing: WorkspaceAiTaskRouting = { ...emptyRouting, general: "a" };
    const result = resolveAiProfileForTask(profiles, routing, "chat");
    expect(result?.id).toBe("a");
  });

  it("라우팅 없으면 첫 번째 enabled 프로필 반환", () => {
    const profiles = [
      makeProfile("disabled", false),
      makeProfile("enabled", true),
    ];
    const result = resolveAiProfileForTask(profiles, emptyRouting, "chat");
    expect(result?.id).toBe("enabled");
  });

  it("enabled 프로필 없으면 첫 번째 프로필 반환", () => {
    const profiles = [makeProfile("only", false)];
    const result = resolveAiProfileForTask(profiles, emptyRouting, "chat");
    expect(result?.id).toBe("only");
  });

  it("프로필 빈 배열이면 null 반환", () => {
    const result = resolveAiProfileForTask([], emptyRouting, "chat");
    expect(result).toBeNull();
  });

  it("disabled 프로필은 라우팅 대상에서 제외", () => {
    const profiles = [makeProfile("a", false), makeProfile("b", true)];
    const routing: WorkspaceAiTaskRouting = { ...emptyRouting, chat: "a" };
    const result = resolveAiProfileForTask(profiles, routing, "chat");
    // "a"는 disabled이므로 general 폴백 → 없으면 첫 번째 enabled → "b"
    expect(result?.id).toBe("b");
  });
});
