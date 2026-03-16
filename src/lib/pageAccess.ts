import { prisma } from "@/lib/prisma";
import { checkWorkspaceAccess } from "@/lib/auth/helpers";
import type { WorkspaceAccessMember } from "@/lib/auth/helpers";

type WorkspaceRole = "owner" | "admin" | "maintainer" | "editor" | "viewer";
type PageAccessMode = "workspace" | "restricted";

interface PageAccessRecord {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  slug: string;
  accessMode: PageAccessMode;
  isDeleted: boolean;
  permissions: { userId: string }[];
}

export function normalizePageAccessMode(value: string): PageAccessMode {
  return value === "restricted" ? "restricted" : "workspace";
}

export interface PageAccessContext {
  page: PageAccessRecord;
  member: WorkspaceAccessMember | null;
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  hasExplicitPermission: boolean;
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return ["owner", "admin", "maintainer", "editor", "viewer"].includes(value);
}

export function hasWorkspaceAccess(
  memberRole: WorkspaceRole,
  accessMode: PageAccessMode,
  hasExplicitPermission: boolean
): boolean {
  if (memberRole === "owner" || memberRole === "admin" || memberRole === "maintainer") return true;
  if (accessMode === "workspace") return true;
  return hasExplicitPermission;
}

export async function getPageAccessContext(
  userId: string,
  pageId: string
): Promise<PageAccessContext | null> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      workspaceId: true,
      parentId: true,
      title: true,
      slug: true,
      accessMode: true,
      isDeleted: true,
      permissions: {
        where: { userId },
        select: { userId: true },
      },
    },
  });

  if (!page || page.isDeleted) return null;
  const normalizedPage: PageAccessRecord = {
    ...page,
    accessMode: normalizePageAccessMode(page.accessMode),
  };

  const member = await checkWorkspaceAccess(userId, normalizedPage.workspaceId);
  if (!member || !isWorkspaceRole(member.role)) {
    return {
      page: normalizedPage,
      member: null,
      canView: false,
      canEdit: false,
      canManage: false,
      hasExplicitPermission: false,
    };
  }

  const hasExplicitPermission = page.permissions.length > 0;
  const canView = hasWorkspaceAccess(
    member.role,
    normalizedPage.accessMode,
    hasExplicitPermission
  );
  const canEdit =
    canView && ["owner", "admin", "maintainer", "editor"].includes(member.role);

  return {
    page: normalizedPage,
    member,
    canView,
    canEdit,
    canManage: canEdit,
    hasExplicitPermission,
  };
}

export async function listAccessiblePages(
  userId: string,
  workspaceId: string
) {
  const member = await checkWorkspaceAccess(userId, workspaceId);
  if (!member || !isWorkspaceRole(member.role)) {
    return { member: null, pages: [] as Array<{
      id: string;
      title: string;
      slug: string;
      icon: string | null;
      position: number;
      parentId: string | null;
      updatedAt: Date;
      accessMode: PageAccessMode;
    }> };
  }

  const where =
    member.role === "owner" || member.role === "admin" || member.role === "maintainer"
      ? { workspaceId, isDeleted: false }
      : {
          workspaceId,
          isDeleted: false,
          OR: [
            { accessMode: "workspace" as const },
            { permissions: { some: { userId } } },
          ],
        };

  const pages = await prisma.page.findMany({
    where,
    select: {
      id: true,
      title: true,
      slug: true,
      icon: true,
      position: true,
      parentId: true,
      updatedAt: true,
      accessMode: true,
    },
    orderBy: { position: "asc" },
  });

  const visibleIds = new Set(pages.map((page) => page.id));
  const normalized = pages.map((page) => ({
    ...page,
    accessMode: normalizePageAccessMode(page.accessMode),
    parentId: page.parentId && visibleIds.has(page.parentId) ? page.parentId : null,
  }));

  return { member, pages: normalized };
}

export async function listAccessiblePageIds(
  userId: string,
  workspaceId: string
): Promise<Set<string>> {
  const { pages } = await listAccessiblePages(userId, workspaceId);
  return new Set(pages.map((page) => page.id));
}

export async function listAccessiblePagesWithPermissions(
  userId: string,
  workspaceId: string
) {
  const { member, pages } = await listAccessiblePages(userId, workspaceId);
  if (!member) return { member: null, pages: [] as typeof pages };

  const permissionRows = await prisma.pagePermission.findMany({
    where: {
      pageId: { in: pages.map((page) => page.id) },
    },
    select: { pageId: true, userId: true },
  });

  const permissionMap = new Map<string, string[]>();
  for (const row of permissionRows) {
    const values = permissionMap.get(row.pageId) ?? [];
    values.push(row.userId);
    permissionMap.set(row.pageId, values);
  }

  return {
    member,
    pages: pages.map((page) => ({
      ...page,
      allowedUserIds: permissionMap.get(page.id) ?? [],
    })),
  };
}
