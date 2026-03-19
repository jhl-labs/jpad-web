import { describe, it, expect, mock } from "bun:test";

// pageLifecycle.ts (permanentlyDeletePageSubtree) depends heavily on prisma and other modules.
// We mock all dependencies and test the function logic.
// IMPORTANT: We do NOT mock @/lib/pages to avoid leaking global mocks that
// break pages.test.ts. Instead we mock prisma.page.findMany to control
// getWorkspacePages output.

const mockRemovePageEmbeddings = mock(() => Promise.resolve());
const mockDeletePageGit = mock(() => Promise.resolve());
const mockDeleteFile = mock(() => Promise.resolve());

mock.module("@/lib/semanticSearch", () => ({
  removePageEmbeddings: mockRemovePageEmbeddings,
}));

mock.module("@/lib/git/repository", () => ({
  deletePage: mockDeletePageGit,
}));

mock.module("@/lib/storage", () => ({
  deleteFile: mockDeleteFile,
}));

const mockFindManyPages = mock(() => Promise.resolve([]));
const mockDeleteManyPages = mock(() => Promise.resolve());
const mockFindManyAttachments = mock(() => Promise.resolve([]));
const mockDeleteManyAttachments = mock(() => Promise.resolve());

mock.module("@/lib/prisma", () => ({
  prisma: {
    attachment: {
      findMany: mockFindManyAttachments,
      deleteMany: mockDeleteManyAttachments,
    },
    page: {
      findMany: mockFindManyPages,
      deleteMany: mockDeleteManyPages,
    },
  },
}));

const { permanentlyDeletePageSubtree } = await import("@/lib/pageLifecycle");

describe("pageLifecycle", () => {
  describe("permanentlyDeletePageSubtree", () => {
    it("서브트리가 비어있으면 0 반환", async () => {
      mockFindManyPages.mockResolvedValue([]);

      const result = await permanentlyDeletePageSubtree("ws1", "page1", {
        actorName: "test-user",
      });

      expect(result.deletedCount).toBe(0);
      expect(result.attachmentCount).toBe(0);
    });

    it("서브트리가 있으면 삭제 수 반환", async () => {
      const pages = [
        { id: "p1", title: "Page 1", slug: "page-1", parentId: null, isDeleted: false },
        { id: "p2", title: "Page 2", slug: "page-2", parentId: "p1", isDeleted: false },
      ];
      mockFindManyPages.mockResolvedValue(pages);
      mockFindManyAttachments.mockResolvedValue([]);

      const result = await permanentlyDeletePageSubtree("ws1", "p1", {
        actorName: "test-user",
      });

      expect(result.deletedCount).toBe(2);
      expect(result.attachmentCount).toBe(0);
    });

    it("dryRun 모드에서는 실제 삭제 없이 카운트만 반환", async () => {
      const pages = [
        { id: "p1", title: "Page 1", slug: "page-1", parentId: null, isDeleted: false },
      ];
      mockFindManyPages.mockResolvedValue(pages);
      mockFindManyAttachments.mockResolvedValue([]);
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
