import { describe, it, expect, mock } from "bun:test";
import {
  buildDefaultAiProfile,
  DEFAULT_AI_TASK_ROUTING,
  type WorkspaceAiProfile,
} from "@/lib/aiConfig";

// Set encryption key so secrets module can load without mocking
// (mocking @/lib/secrets globally would break secrets.test.ts)
if (!process.env.APP_ENCRYPTION_KEY) {
  process.env.APP_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
}

const {
  getResolvedBaseUrl,
  resolveAiProfileForTask,
  normalizeAiProfilesFromStorage,
  normalizeAiTaskRoutingFromStorage,
  maskAiProfiles,
} = await import("@/lib/aiSettings");

function makeProfile(overrides: Partial<WorkspaceAiProfile> = {}): WorkspaceAiProfile {
  return buildDefaultAiProfile(overrides);
}

describe("aiSettings", () => {
  describe("resolveAiProfileForTask", () => {
    it("활성 프로필이 있으면 라우팅에 따라 선택", () => {
      const profiles = [
        makeProfile({ id: "p1", name: "Profile 1", enabled: true }),
        makeProfile({ id: "p2", name: "Profile 2", enabled: true }),
      ];
      const routing = { ...DEFAULT_AI_TASK_ROUTING, write: "p2" };

      const result = resolveAiProfileForTask(profiles, routing, "write");
      expect(result?.id).toBe("p2");
    });

    it("비활성 프로필은 건너뛰고 general 폴백", () => {
      const profiles = [
        makeProfile({ id: "p1", name: "Profile 1", enabled: false }),
        makeProfile({ id: "p2", name: "Profile 2", enabled: true }),
      ];
      const routing = { ...DEFAULT_AI_TASK_ROUTING, general: "p2", write: "p1" };

      const result = resolveAiProfileForTask(profiles, routing, "write");
      // p1 is disabled, so falls back to general → p2
      expect(result?.id).toBe("p2");
    });

    it("빈 프로필 배열은 null 반환", () => {
      const result = resolveAiProfileForTask([], DEFAULT_AI_TASK_ROUTING, "general");
      expect(result).toBeNull();
    });

    it("라우팅이 모두 null이면 첫 번째 활성 프로필 사용", () => {
      const profiles = [
        makeProfile({ id: "p1", enabled: true }),
        makeProfile({ id: "p2", enabled: true }),
      ];

      const result = resolveAiProfileForTask(profiles, DEFAULT_AI_TASK_ROUTING, "chat");
      expect(result?.id).toBe("p1");
    });
  });

  describe("getResolvedBaseUrl", () => {
    it("프로필에 baseUrl이 있으면 그대로 사용", () => {
      const profile = makeProfile({ baseUrl: "https://custom.api.com" });
      expect(getResolvedBaseUrl(profile)).toBe("https://custom.api.com");
    });

    it("anthropic 프로바이더의 기본 URL", () => {
      const profile = makeProfile({ provider: "anthropic", baseUrl: null });
      expect(getResolvedBaseUrl(profile)).toBe("https://api.anthropic.com");
    });

    it("openai 프로바이더의 기본 URL", () => {
      const profile = makeProfile({ provider: "openai", baseUrl: null });
      expect(getResolvedBaseUrl(profile)).toBe("https://api.openai.com");
    });

    it("ollama 프로바이더의 기본 URL", () => {
      const profile = makeProfile({ provider: "ollama", baseUrl: null });
      expect(getResolvedBaseUrl(profile)).toBe("http://localhost:11434");
    });
  });

  describe("normalizeAiProfilesFromStorage", () => {
    const legacy = { aiModel: "claude-sonnet-4-20250514", aiApiKey: null, aiMaxTokens: 2048 };

    it("유효한 배열을 정규화하여 반환", () => {
      const stored = [
        {
          id: "p1",
          name: "Test",
          provider: "anthropic",
          enabled: true,
          model: "test-model",
        },
      ];

      const result = normalizeAiProfilesFromStorage(stored, legacy);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
    });

    it("배열이 아닌 값은 레거시 프로필 반환", () => {
      const result = normalizeAiProfilesFromStorage(null, legacy);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("legacy-anthropic");
    });

    it("빈 배열은 레거시 프로필 반환", () => {
      const result = normalizeAiProfilesFromStorage([], legacy);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("legacy-anthropic");
    });
  });

  describe("maskAiProfiles", () => {
    it("API 키가 있으면 마스킹", () => {
      const profiles = [makeProfile({ apiKey: "sk-secret" })];
      const masked = maskAiProfiles(profiles);
      expect(masked[0].apiKey).toBe("••••••••");
    });

    it("API 키가 null이면 null 유지", () => {
      const profiles = [makeProfile({ apiKey: null })];
      const masked = maskAiProfiles(profiles);
      expect(masked[0].apiKey).toBeNull();
    });
  });

  describe("normalizeAiTaskRoutingFromStorage", () => {
    it("유효한 프로필 ID만 유지", () => {
      const profiles = [makeProfile({ id: "p1", enabled: true })];
      const stored = { general: "p1", write: "nonexistent" };

      const result = normalizeAiTaskRoutingFromStorage(stored, profiles);
      expect(result.general).toBe("p1");
      expect(result.write).toBeNull();
    });

    it("general이 null이면 첫 번째 활성 프로필로 설정", () => {
      const profiles = [
        makeProfile({ id: "p1", enabled: false }),
        makeProfile({ id: "p2", enabled: true }),
      ];

      const result = normalizeAiTaskRoutingFromStorage({}, profiles);
      expect(result.general).toBe("p2");
    });
  });
});
