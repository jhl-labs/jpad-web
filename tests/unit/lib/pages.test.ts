import { describe, it, expect, mock } from "bun:test";

// pages.ts imports prisma, mock it
mock.module("@/lib/prisma", () => ({ prisma: {} }));

const {
  collectPageSubtree,
  collectPageAncestors,
} = await import("@/lib/pages");

type WorkspacePageRecord = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  isDeleted: boolean;
};

// pages.ts의 순수 함수(collectPageSubtree, collectPageAncestors)를 테스트합니다.
// DB 의존 함수(getWorkspacePages)는 통합테스트에서 다룹니다.

const samplePages: WorkspacePageRecord[] = [
  { id: "root", title: "Root", slug: "root", parentId: null, isDeleted: false },
  { id: "child-1", title: "Child 1", slug: "child-1", parentId: "root", isDeleted: false },
  { id: "child-2", title: "Child 2", slug: "child-2", parentId: "root", isDeleted: false },
  { id: "grandchild-1", title: "Grandchild 1", slug: "grandchild-1", parentId: "child-1", isDeleted: false },
  { id: "orphan", title: "Orphan", slug: "orphan", parentId: null, isDeleted: false },
];

describe("pages - collectPageSubtree", () => {
  it("루트에서 모든 하위 페이지를 수집한다", () => {
    const subtree = collectPageSubtree(samplePages, "root");
    const ids = subtree.map((p: WorkspacePageRecord) => p.id);
    expect(ids).toContain("root");
    expect(ids).toContain("child-1");
    expect(ids).toContain("child-2");
    expect(ids).toContain("grandchild-1");
    expect(ids).not.toContain("orphan");
  });

  it("중간 노드에서 하위만 수집한다", () => {
    const subtree = collectPageSubtree(samplePages, "child-1");
    const ids = subtree.map((p: WorkspacePageRecord) => p.id);
    expect(ids).toContain("child-1");
    expect(ids).toContain("grandchild-1");
    expect(ids).not.toContain("root");
    expect(ids).not.toContain("child-2");
  });

  it("리프 노드는 자기 자신만 반환한다", () => {
    const subtree = collectPageSubtree(samplePages, "grandchild-1");
    expect(subtree).toHaveLength(1);
    expect(subtree[0].id).toBe("grandchild-1");
  });

  it("존재하지 않는 ID는 빈 배열을 반환한다", () => {
    const subtree = collectPageSubtree(samplePages, "nonexistent");
    expect(subtree).toHaveLength(0);
  });

  it("순환 참조가 있어도 무한루프에 빠지지 않는다", () => {
    const cyclic: WorkspacePageRecord[] = [
      { id: "a", title: "A", slug: "a", parentId: "b", isDeleted: false },
      { id: "b", title: "B", slug: "b", parentId: "a", isDeleted: false },
    ];
    const subtree = collectPageSubtree(cyclic, "a");
    // seen으로 중복 방지되므로 최대 2개
    expect(subtree.length).toBeLessThanOrEqual(2);
  });
});

describe("pages - collectPageAncestors", () => {
  it("하위 페이지에서 조상을 수집한다", () => {
    const ancestors = collectPageAncestors(samplePages, "grandchild-1");
    const ids = ancestors.map((p: WorkspacePageRecord) => p.id);
    expect(ids).toContain("child-1");
    expect(ids).toContain("root");
  });

  it("루트 페이지는 조상이 없다", () => {
    const ancestors = collectPageAncestors(samplePages, "root");
    expect(ancestors).toHaveLength(0);
  });

  it("존재하지 않는 ID는 빈 배열을 반환한다", () => {
    const ancestors = collectPageAncestors(samplePages, "nonexistent");
    expect(ancestors).toHaveLength(0);
  });

  it("순환 참조가 있어도 무한루프에 빠지지 않는다", () => {
    const cyclic: WorkspacePageRecord[] = [
      { id: "a", title: "A", slug: "a", parentId: "b", isDeleted: false },
      { id: "b", title: "B", slug: "b", parentId: "a", isDeleted: false },
    ];
    const ancestors = collectPageAncestors(cyclic, "a");
    expect(ancestors.length).toBeLessThanOrEqual(2);
  });
});
