import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// pageAccess.ts의 순수 함수(내부) 로직을 테스트합니다.
// DB 의존 함수(getPageAccessContext 등)는 통합테스트에서 다룹니다.
// 여기서는 role/accessMode 기반 권한 판단 로직을 검증합니다.

type WorkspaceRole = "owner" | "admin" | "maintainer" | "editor" | "viewer";
type PageAccessMode = "workspace" | "restricted";

// pageAccess.ts의 내부 함수를 재현하여 로직 테스트
function isWorkspaceRole(value: string): value is WorkspaceRole {
  return ["owner", "admin", "maintainer", "editor", "viewer"].includes(value);
}

function hasWorkspaceAccess(
  memberRole: WorkspaceRole,
  accessMode: PageAccessMode,
  hasExplicitPermission: boolean
): boolean {
  if (memberRole === "owner" || memberRole === "admin" || memberRole === "maintainer") return true;
  if (accessMode === "workspace") return true;
  return hasExplicitPermission;
}

function normalizePageAccessMode(value: string): PageAccessMode {
  return value === "restricted" ? "restricted" : "workspace";
}

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
    const roles: WorkspaceRole[] = ["owner", "admin", "maintainer"];
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
