import { describe, it, expect } from "bun:test";
import {
  normalizeOrganizationDomain,
  extractEmailDomain,
  canManageOrganization,
  canCreateOrganizationWorkspace,
  buildOrganizationDomainTxtRecord,
  generateOrganizationDomainVerificationToken,
} from "@/lib/organizations";

describe("organizations", () => {
  describe("역할 권한 검증", () => {
    it("owner와 admin은 조직 관리 가능", () => {
      expect(canManageOrganization("owner")).toBe(true);
      expect(canManageOrganization("admin")).toBe(true);
    });

    it("member는 조직 관리 불가", () => {
      expect(canManageOrganization("member")).toBe(false);
    });

    it("알 수 없는 역할은 조직 관리 불가", () => {
      expect(canManageOrganization("unknown")).toBe(false);
      expect(canManageOrganization("")).toBe(false);
    });

    it("owner와 admin은 워크스페이스 생성 가능", () => {
      expect(canCreateOrganizationWorkspace("owner")).toBe(true);
      expect(canCreateOrganizationWorkspace("admin")).toBe(true);
    });

    it("member는 워크스페이스 생성 불가", () => {
      expect(canCreateOrganizationWorkspace("member")).toBe(false);
    });
  });

  describe("normalizeOrganizationDomain", () => {
    it("도메인을 소문자로 정규화", () => {
      expect(normalizeOrganizationDomain("Example.COM")).toBe("example.com");
    });

    it("앞뒤 공백 및 @ 접두사 제거", () => {
      expect(normalizeOrganizationDomain("  @example.com  ")).toBe("example.com");
    });

    it("후행 마침표 제거", () => {
      expect(normalizeOrganizationDomain("example.com.")).toBe("example.com");
    });
  });

  describe("extractEmailDomain", () => {
    it("이메일에서 도메인 추출", () => {
      expect(extractEmailDomain("user@example.com")).toBe("example.com");
    });

    it("잘못된 이메일은 null 반환", () => {
      expect(extractEmailDomain("not-an-email")).toBeNull();
    });
  });

  describe("buildOrganizationDomainTxtRecord", () => {
    it("올바른 TXT 레코드 형식 생성", () => {
      const record = buildOrganizationDomainTxtRecord("example.com");
      expect(record.name).toBe("_jpad.example.com");
      expect(record.valuePrefix).toBe("jpad-domain-verification=");
    });
  });

  describe("generateOrganizationDomainVerificationToken", () => {
    it("고유한 토큰 생성", () => {
      const token1 = generateOrganizationDomainVerificationToken();
      const token2 = generateOrganizationDomainVerificationToken();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThan(0);
    });
  });
});
