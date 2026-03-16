import { describe, it, expect, afterEach } from "bun:test";
import { getBackupConfig, formatBackupStamp } from "@/lib/backup";

describe("backup", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // 환경 변수 복원
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("BACKUP_") || key === "RESTORE_DRILL_REPO_SAMPLE_LIMIT") {
        if (originalEnv[key] !== undefined) {
          process.env[key] = originalEnv[key];
        } else {
          delete process.env[key];
        }
      }
    }
  });

  describe("getBackupConfig", () => {
    it("기본 설정값이 올바르게 반환됨", () => {
      delete process.env.BACKUP_DATABASE_STRATEGY;
      delete process.env.BACKUP_INCLUDE_REPOS;
      delete process.env.BACKUP_INCLUDE_UPLOADS;
      delete process.env.BACKUP_INCLUDE_YJS;

      const config = getBackupConfig();

      expect(config.includeRepos).toBe(true);
      expect(config.includeUploads).toBe(true);
      expect(config.includeYjs).toBe(true);
      expect(config.databaseStrategy).toBe("auto");
      expect(config.pgDumpBin).toBe("pg_dump");
      expect(config.tarBin).toBe("tar");
      expect(config.gitBin).toBe("git");
      expect(config.restoreDrillRepoSampleLimit).toBe(3);
    });

    it("환경 변수로 databaseStrategy를 pg_dump으로 설정", () => {
      process.env.BACKUP_DATABASE_STRATEGY = "pg_dump";
      const config = getBackupConfig();
      expect(config.databaseStrategy).toBe("pg_dump");
    });

    it("잘못된 databaseStrategy는 auto로 폴백", () => {
      process.env.BACKUP_DATABASE_STRATEGY = "invalid_strategy";
      const config = getBackupConfig();
      expect(config.databaseStrategy).toBe("auto");
    });

    it("BACKUP_INCLUDE_REPOS=false로 설정 가능", () => {
      process.env.BACKUP_INCLUDE_REPOS = "false";
      const config = getBackupConfig();
      expect(config.includeRepos).toBe(false);
    });

    it("restoreDrillRepoSampleLimit 범위 제한 (1~20)", () => {
      process.env.RESTORE_DRILL_REPO_SAMPLE_LIMIT = "50";
      const config = getBackupConfig();
      expect(config.restoreDrillRepoSampleLimit).toBe(20);
    });
  });

  describe("formatBackupStamp", () => {
    it("날짜를 올바른 백업 스탬프 형식으로 변환", () => {
      const date = new Date("2024-06-15T10:30:45.123Z");
      const stamp = formatBackupStamp(date);
      expect(stamp).toBe("20240615T103045Z");
    });

    it("밀리초와 구분 기호가 제거됨", () => {
      const stamp = formatBackupStamp(new Date("2024-01-01T00:00:00.000Z"));
      expect(stamp).not.toContain("-");
      expect(stamp).not.toContain(":");
      expect(stamp).not.toContain(".");
      expect(stamp).toEndWith("Z");
    });
  });
});
