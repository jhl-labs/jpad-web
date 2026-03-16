import { describe, it, expect, afterEach } from "bun:test";
import { getRetentionConfig, subtractDays } from "@/lib/retention";

describe("retention", () => {
  const envKeys = [
    "TRASH_RETENTION_DAYS",
    "AI_CHAT_RETENTION_DAYS",
    "REVOKED_SHARE_RETENTION_DAYS",
    "AUDIT_LOG_RETENTION_DAYS",
  ] as const;

  const originals = Object.fromEntries(
    envKeys.map((k) => [k, process.env[k]])
  );

  afterEach(() => {
    for (const key of envKeys) {
      if (originals[key] !== undefined) {
        process.env[key] = originals[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe("getRetentionConfig 기본값", () => {
    it("환경변수 미설정 시 기본 보존일 반환", () => {
      for (const key of envKeys) delete process.env[key];
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(30);
      expect(config.aiChatRetentionDays).toBe(90);
      expect(config.revokedShareRetentionDays).toBe(30);
      expect(config.auditLogRetentionDays).toBe(365);
    });
  });

  describe("환경변수 오버라이드", () => {
    it("유효한 숫자로 오버라이드", () => {
      process.env.TRASH_RETENTION_DAYS = "7";
      process.env.AI_CHAT_RETENTION_DAYS = "14";
      process.env.REVOKED_SHARE_RETENTION_DAYS = "60";
      process.env.AUDIT_LOG_RETENTION_DAYS = "180";
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(7);
      expect(config.aiChatRetentionDays).toBe(14);
      expect(config.revokedShareRetentionDays).toBe(60);
      expect(config.auditLogRetentionDays).toBe(180);
    });

    it("비숫자 문자열이면 기본값 사용", () => {
      process.env.TRASH_RETENTION_DAYS = "abc";
      process.env.AI_CHAT_RETENTION_DAYS = "";
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(30);
      expect(config.aiChatRetentionDays).toBe(90);
    });
  });

  describe("경계값", () => {
    it("0일 → 최소 1일로 클램핑", () => {
      process.env.TRASH_RETENTION_DAYS = "0";
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(1);
    });

    it("음수 → 최소 1일로 클램핑", () => {
      process.env.TRASH_RETENTION_DAYS = "-10";
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(1);
    });

    it("매우 큰 값 → 최대 3650일로 클램핑", () => {
      process.env.AUDIT_LOG_RETENTION_DAYS = "99999";
      const config = getRetentionConfig();
      expect(config.auditLogRetentionDays).toBe(3650);
    });

    it("경계 값 1 → 그대로 1", () => {
      process.env.TRASH_RETENTION_DAYS = "1";
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(1);
    });

    it("경계 값 3650 → 그대로 3650", () => {
      process.env.TRASH_RETENTION_DAYS = "3650";
      const config = getRetentionConfig();
      expect(config.trashRetentionDays).toBe(3650);
    });
  });

  describe("subtractDays", () => {
    it("날짜에서 일수 차감", () => {
      const base = new Date("2025-01-31T00:00:00Z");
      const result = subtractDays(base, 30);
      expect(result.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    });

    it("0일 차감 시 동일 날짜", () => {
      const base = new Date("2025-06-15T12:00:00Z");
      const result = subtractDays(base, 0);
      expect(result.getTime()).toBe(base.getTime());
    });
  });
});
