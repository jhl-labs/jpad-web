import { describe, it, expect } from "bun:test";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/lib/workspaceSettings";

describe("workspaceSettings", () => {
  describe("DEFAULT_WORKSPACE_SETTINGS", () => {
    it("기본 설정값이 올바르게 정의됨", () => {
      expect(DEFAULT_WORKSPACE_SETTINGS.aiEnabled).toBe(true);
      expect(DEFAULT_WORKSPACE_SETTINGS.aiModel).toBe("claude-sonnet-4-20250514");
      expect(DEFAULT_WORKSPACE_SETTINGS.aiApiKey).toBeNull();
      expect(DEFAULT_WORKSPACE_SETTINGS.aiMaxTokens).toBe(2048);
      expect(DEFAULT_WORKSPACE_SETTINGS.allowPublicPages).toBe(true);
      expect(DEFAULT_WORKSPACE_SETTINGS.allowMemberInvite).toBe(true);
      expect(DEFAULT_WORKSPACE_SETTINGS.defaultPageAccess).toBe("workspace");
      expect(DEFAULT_WORKSPACE_SETTINGS.maxFileUploadMb).toBe(10);
    });

    it("DLP 관련 기본값이 null임", () => {
      expect(DEFAULT_WORKSPACE_SETTINGS.uploadDlpScanMode).toBeNull();
      expect(DEFAULT_WORKSPACE_SETTINGS.uploadDlpDetectors).toBeNull();
      expect(DEFAULT_WORKSPACE_SETTINGS.uploadDlpMaxExtractedCharacters).toBeNull();
    });

    it("aiProfiles 기본값이 빈 배열임", () => {
      expect(DEFAULT_WORKSPACE_SETTINGS.aiProfiles).toEqual([]);
    });

    it("aiTaskRouting 기본값이 모두 null임", () => {
      const routing = DEFAULT_WORKSPACE_SETTINGS.aiTaskRouting;
      expect(routing.general).toBeNull();
      expect(routing.write).toBeNull();
      expect(routing.chat).toBeNull();
      expect(routing.summary).toBeNull();
      expect(routing.autocomplete).toBeNull();
      expect(routing.embedding).toBeNull();
    });
  });
});
