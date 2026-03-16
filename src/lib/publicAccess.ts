import { checkWorkspaceAccess, getCurrentUser } from "@/lib/auth/helpers";
import { prisma } from "@/lib/prisma";

interface ShareLinkState {
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export function isShareLinkActive(link: ShareLinkState | null | undefined): boolean {
  if (!link || link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export async function getWorkspaceViewAccess(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      publicWikiEnabled: true,
    },
  });

  if (!workspace) {
    return { workspace: null, user: null, member: null };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { workspace, user: null, member: null };
  }

  const member = await checkWorkspaceAccess(user.id, workspaceId);
  return { workspace, user, member };
}

export async function canAccessPagePublicly(pageId: string): Promise<boolean> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      isDeleted: true,
      accessMode: true,
      workspace: {
        select: {
          publicWikiEnabled: true,
          settings: {
            select: {
              allowPublicPages: true,
            },
          },
        },
      },
      shareLink: {
        select: {
          expiresAt: true,
          revokedAt: true,
        },
      },
    },
  });

  if (!page || page.isDeleted) return false;
  const allowPublicPages = page.workspace.settings?.allowPublicPages !== false;
  return (
    (allowPublicPages && isShareLinkActive(page.shareLink)) ||
    (page.accessMode === "workspace" && page.workspace.publicWikiEnabled)
  );
}

export async function getActiveShareLinkByToken(token: string) {
  const shareLink = await prisma.pageShareLink.findUnique({
    where: { token },
    include: {
      page: {
        select: {
          id: true,
          title: true,
          slug: true,
          updatedAt: true,
          isDeleted: true,
          accessMode: true,
          workspaceId: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
              publicWikiEnabled: true,
              settings: {
                select: {
                  allowPublicPages: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    !shareLink ||
    shareLink.page.isDeleted ||
    !isShareLinkActive(shareLink) ||
    shareLink.page.workspace.settings?.allowPublicPages === false
  ) {
    return null;
  }

  return shareLink;
}
