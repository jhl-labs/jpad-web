import { describe, it, expect, afterEach } from "bun:test";

// auth/helpers.ts의 getCurrentUser, requireAuth, checkWorkspaceAccess는 DB 의존이므로
// 여기서는 순수 함수인 getPlatformAdminEmails, isPlatformAdminEmail만 테스트합니다.

// mock 설정: auth/helpers.ts가 prisma, next-auth를 import하므로 mock 필요
import { mock } from "bun:test";

mock.module("next-auth", () => ({ getServerSession: async () => null }));
mock.module("@/lib/auth/options", () => ({ authOptions: {} }));
mock.module("@/lib/prisma", () => ({ prisma: {} }));

const { getPlatformAdminEmails, isPlatformAdminEmail } = await import(
  "@/lib/auth/helpers"
);

describe("getPlatformAdminEmails", () => {
  const original = process.env.PLATFORM_ADMIN_EMAILS;

  afterEach(() => {
    if (original !== undefined) {
      process.env.PLATFORM_ADMIN_EMAILS = original;
    } else {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    }
  });

  it("환경 변수 미설정 시 빈 배열을 반환한다", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(getPlatformAdminEmails()).toEqual([]);
  });

  it("빈 문자열이면 빈 배열을 반환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    expect(getPlatformAdminEmails()).toEqual([]);
  });

  it("쉼표로 구분된 이메일을 파싱한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@test.com, boss@test.com";
    expect(getPlatformAdminEmails()).toEqual(["admin@test.com", "boss@test.com"]);
  });

  it("이메일 앞뒤 공백을 제거하고 소문자로 변환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "  Admin@Test.COM  ,  BOSS@Test.com  ";
    expect(getPlatformAdminEmails()).toEqual(["admin@test.com", "boss@test.com"]);
  });

  it("빈 항목을 필터링한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "a@b.com,,, ,c@d.com";
    expect(getPlatformAdminEmails()).toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("isPlatformAdminEmail", () => {
  const original = process.env.PLATFORM_ADMIN_EMAILS;

  afterEach(() => {
    if (original !== undefined) {
      process.env.PLATFORM_ADMIN_EMAILS = original;
    } else {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    }
  });

  it("null/undefined는 false를 반환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@test.com";
    expect(isPlatformAdminEmail(null)).toBe(false);
    expect(isPlatformAdminEmail(undefined)).toBe(false);
  });

  it("빈 문자열은 false를 반환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@test.com";
    expect(isPlatformAdminEmail("")).toBe(false);
  });

  it("등록된 관리자 이메일이면 true를 반환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@test.com,boss@test.com";
    expect(isPlatformAdminEmail("admin@test.com")).toBe(true);
    expect(isPlatformAdminEmail("boss@test.com")).toBe(true);
  });

  it("대소문자를 무시하고 비교한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@test.com";
    expect(isPlatformAdminEmail("ADMIN@TEST.COM")).toBe(true);
    expect(isPlatformAdminEmail("Admin@Test.Com")).toBe(true);
  });

  it("등록되지 않은 이메일은 false를 반환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@test.com";
    expect(isPlatformAdminEmail("user@test.com")).toBe(false);
  });

  it("환경 변수가 비어 있으면 모든 이메일에 false를 반환한다", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    expect(isPlatformAdminEmail("admin@test.com")).toBe(false);
  });
});
