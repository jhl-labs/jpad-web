import { describe, it, expect, mock } from "bun:test";
import { beforeAll } from "bun:test";

// publicAccess.ts가 @/lib/prisma, @/lib/auth/helpers를 import하므로 mock 처리
mock.module("@/lib/prisma", () => ({ prisma: {} }));
mock.module("@/lib/auth/helpers", () => ({
  checkWorkspaceAccess: async () => null,
  getCurrentUser: async () => null,
}));

// mock 설정 후 dynamic import
let isShareLinkActive: (link: { expiresAt: Date | null; revokedAt: Date | null } | null | undefined) => boolean;

beforeAll(async () => {
  const mod = await import("@/lib/publicAccess");
  isShareLinkActive = mod.isShareLinkActive;
});

describe("publicAccess - isShareLinkActive", () => {
  it("null/undefined 링크는 비활성으로 판단한다", () => {
    expect(isShareLinkActive(null)).toBe(false);
    expect(isShareLinkActive(undefined)).toBe(false);
  });

  it("revokedAt이 설정된 링크는 비활성으로 판단한다", () => {
    expect(
      isShareLinkActive({ expiresAt: null, revokedAt: new Date() })
    ).toBe(false);
  });

  it("만료되지 않은 링크는 활성으로 판단한다", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(
      isShareLinkActive({ expiresAt: future, revokedAt: null })
    ).toBe(true);
  });

  it("expiresAt이 null(무제한)인 링크는 활성으로 판단한다", () => {
    expect(
      isShareLinkActive({ expiresAt: null, revokedAt: null })
    ).toBe(true);
  });

  it("이미 만료된 링크는 비활성으로 판단한다", () => {
    const past = new Date(Date.now() - 1000);
    expect(
      isShareLinkActive({ expiresAt: past, revokedAt: null })
    ).toBe(false);
  });

  it("정확히 현재 시각에 만료되는 링크는 비활성으로 판단한다", () => {
    const now = new Date();
    expect(
      isShareLinkActive({ expiresAt: now, revokedAt: null })
    ).toBe(false);
  });

  it("revoked이면서 만료되지 않은 링크도 비활성으로 판단한다", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(
      isShareLinkActive({ expiresAt: future, revokedAt: new Date() })
    ).toBe(false);
  });
});
