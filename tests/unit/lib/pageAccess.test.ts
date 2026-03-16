import { describe, it, expect } from "bun:test";
import {
  isWorkspaceRole,
  hasWorkspaceAccess,
  normalizePageAccessMode,
} from "@/lib/pageAccess";

// pageAccess.ts에서 export된 순수 함수를 직접 import하여 테스트합니다.
// DB 의존 함수(getPageAccessContext 등)는 통합테스트에서 다룹니다.

describe("pageAccess - isWorkspaceRole", () => {
  it("유효한 역할을 인식한다", () => {
    expect(isWorkspaceRole("owner")).toBe(true);
    expect(isWorkspaceRole("admin")).toBe(true);
    expect(isWorkspaceRole("maintainer")).toBe(true);
    expect(isWorkspaceRole("editor")).toBe(true);
    expect(isWorkspaceRole("viewer")).toBe(true);
  });

  it("잘못된 역할을 거부한다", () => {
    expect(isWorkspaceRole("superadmin")).toBe(false);
    expect(isWorkspaceRole("")).toBe(false);
    expect(isWorkspaceRole("OWNER")).toBe(false);
  });
});

describe("pageAccess - hasWorkspaceAccess", () => {
  it("owner/admin/maintainer는 항상 접근 가능하다", () => {
    const roles = ["owner", "admin", "maintainer"] as const;
    for (const role of roles) {
      expect(hasWorkspaceAccess(role, "restricted", false)).toBe(true);
      expect(hasWorkspaceAccess(role, "workspace", false)).toBe(true);
    }
  });

  it("editor/viewer는 workspace 모드에서 접근 가능하다", () => {
    expect(hasWorkspaceAccess("editor", "workspace", false)).toBe(true);
    expect(hasWorkspaceAccess("viewer", "workspace", false)).toBe(true);
  });

  it("editor/viewer는 restricted 모드에서 명시적 권한 없이 접근 불가하다", () => {
    expect(hasWorkspaceAccess("editor", "restricted", false)).toBe(false);
    expect(hasWorkspaceAccess("viewer", "restricted", false)).toBe(false);
  });

  it("editor/viewer는 restricted 모드에서 명시적 권한이 있으면 접근 가능하다", () => {
    expect(hasWorkspaceAccess("editor", "restricted", true)).toBe(true);
    expect(hasWorkspaceAccess("viewer", "restricted", true)).toBe(true);
  });
});

describe("pageAccess - normalizePageAccessMode", () => {
  it("restricted를 올바르게 반환한다", () => {
    expect(normalizePageAccessMode("restricted")).toBe("restricted");
  });

  it("workspace를 올바르게 반환한다", () => {
    expect(normalizePageAccessMode("workspace")).toBe("workspace");
  });

  it("알 수 없는 값은 workspace로 정규화한다", () => {
    expect(normalizePageAccessMode("unknown")).toBe("workspace");
    expect(normalizePageAccessMode("")).toBe("workspace");
    expect(normalizePageAccessMode("RESTRICTED")).toBe("workspace");
  });
});
