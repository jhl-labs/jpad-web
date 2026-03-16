import { describe, it, expect, mock } from "bun:test";

// pageLifecycle.ts (permanentlyDeletePageSubtree) depends heavily on prisma and other modules.
// We mock all dependencies and test the function logic.

const mockGetWorkspacePages = mock(() => Promise.resolve([]));
const mockCollectPageSubtree = mock(() => []);
const mockRemovePageEmbeddings = mock(() => Promise.resolve());
const mockDeletePageGit = mock(() => Promise.resolve());
const mockDeleteFile = mock(() => Promise.resolve());

mock.module("@/lib/pages", () => ({
  collectPageSubtree: mockCollectPageSubtree,
  getWorkspacePages: mockGetWorkspacePages,
}));

mock.module("@/lib/semanticSearch", () => ({
  removePageEmbeddings: mockRemovePageEmbeddings,
}));

mock.module("@/lib/git/repository", () => ({
  deletePage: mockDeletePageGit,
}));

mock.module("@/lib/storage", () => ({
  deleteFile: mockDeleteFile,
}));

mock.module("@/lib/prisma", () => ({
  prisma: {
    attachment: {
      findMany: mock(() => Promise.resolve([])),
      deleteMany: mock(() => Promise.resolve()),
    },
    page: {
      deleteMany: mock(() => Promise.resolve()),
    },
  },
}));

const { permanentlyDeletePageSubtree } = await import("@/lib/pageLifecycle");

describe("pageLifecycle", () => {
  describe("permanentlyDeletePageSubtree", () => {
    it("서브트리가 비어있으면 0 반환", async () => {
      mockGetWorkspacePages.mockResolvedValue([]);
      mockCollectPageSubtree.mockReturnValue([]);

      const result = await permanentlyDeletePageSubtree("ws1", "page1", {
        actorName: "test-user",
      });

      expect(result.deletedCount).toBe(0);
      expect(result.attachmentCount).toBe(0);
    });

    it("서브트리가 있으면 삭제 수 반환", async () => {
      const pages = [
        { id: "p1", slug: "page-1" },
        { id: "p2", slug: "page-2" },
      ];
      mockGetWorkspacePages.mockResolvedValue(pages);
      mockCollectPageSubtree.mockReturnValue(pages);

      const result = await permanentlyDeletePageSubtree("ws1", "p1", {
        actorName: "test-user",
      });

      expect(result.deletedCount).toBe(2);
      expect(result.attachmentCount).toBe(0);
    });

    it("dryRun 모드에서는 실제 삭제 없이 카운트만 반환", async () => {
      const pages = [{ id: "p1", slug: "page-1" }];
      mockGetWorkspacePages.mockResolvedValue(pages);
      mockCollectPageSubtree.mockReturnValue(pages);
      mockDeletePageGit.mockClear();

      const result = await permanentlyDeletePageSubtree("ws1", "p1", {
        actorName: "test-user",
        dryRun: true,
      });

      expect(result.deletedCount).toBe(1);
      expect(mockDeletePageGit).not.toHaveBeenCalled();
    });
  });
});
