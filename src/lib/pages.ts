import { prisma } from "@/lib/prisma";

export interface WorkspacePageRecord {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  isDeleted: boolean;
}

export async function getWorkspacePages(
  workspaceId: string
): Promise<WorkspacePageRecord[]> {
  return prisma.page.findMany({
    where: { workspaceId },
    select: {
      id: true,
      title: true,
      slug: true,
      parentId: true,
      isDeleted: true,
    },
  });
}

export function collectPageSubtree(
  pages: WorkspacePageRecord[],
  rootId: string
): WorkspacePageRecord[] {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const childrenByParent = new Map<string | null, WorkspacePageRecord[]>();

  for (const page of pages) {
    const siblings = childrenByParent.get(page.parentId) ?? [];
    siblings.push(page);
    childrenByParent.set(page.parentId, siblings);
  }

  const subtree: WorkspacePageRecord[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || seen.has(currentId)) continue;

    const page = pageById.get(currentId);
    if (!page) continue;

    seen.add(currentId);
    subtree.push(page);

    for (const child of childrenByParent.get(currentId) ?? []) {
      queue.push(child.id);
    }
  }

  return subtree;
}

export function collectPageAncestors(
  pages: WorkspacePageRecord[],
  pageId: string
): WorkspacePageRecord[] {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const ancestors: WorkspacePageRecord[] = [];
  const seen = new Set<string>();

  let current = pageById.get(pageId) ?? null;
  while (current?.parentId) {
    const parent = pageById.get(current.parentId) ?? null;
    if (!parent || seen.has(parent.id)) break;
    ancestors.push(parent);
    seen.add(parent.id);
    current = parent;
  }

  return ancestors;
}
