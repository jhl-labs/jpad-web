import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { prisma } from "@/lib/prisma";

export interface WorkspaceAccessMember {
  id?: string;
  role: string;
  userId: string;
  workspaceId: string;
  isPublicViewer?: boolean;
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;
  if (!sessionUser) return null;

  if (sessionUser.id) {
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (user) return user;
  }

  if (!sessionUser.email) return null;
  return prisma.user.findUnique({ where: { email: sessionUser.email } });
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export function getPlatformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getPlatformAdminEmails().includes(email.trim().toLowerCase());
}

export async function requirePlatformAdmin() {
  const user = await requireAuth();
  if (!user.isPlatformAdmin && !isPlatformAdminEmail(user.email)) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function checkWorkspaceAccess(
  userId: string,
  workspaceId: string,
  requiredRole?: string[]
): Promise<WorkspaceAccessMember | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });

  if (member) {
    if (requiredRole && !requiredRole.includes(member.role)) return null;
    return member;
  }

  if (requiredRole) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { visibility: true },
  });
  if (workspace?.visibility !== "public") return null;

  return {
    role: "viewer",
    userId,
    workspaceId,
    isPublicViewer: true,
  };
}
