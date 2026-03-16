import { prisma } from "@/lib/prisma";

export type NotificationType =
  | "todo_due"
  | "event_reminder"
  | "mention"
  | "assignment"
  | "system";

interface CreateNotificationOpts {
  workspaceId?: string;
  link?: string;
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  opts?: CreateNotificationOpts
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      workspaceId: opts?.workspaceId ?? null,
      link: opts?.link ?? null,
    },
  });
}

export async function createBulkNotifications(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string,
  opts?: CreateNotificationOpts
) {
  if (userIds.length === 0) return;

  return prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      workspaceId: opts?.workspaceId ?? null,
      link: opts?.link ?? null,
    })),
  });
}

export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true, readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string, workspaceId?: string) {
  const where: { userId: string; read: boolean; workspaceId?: string } = {
    userId,
    read: false,
  };
  if (workspaceId) {
    where.workspaceId = workspaceId;
  }

  return prisma.notification.updateMany({
    where,
    data: { read: true, readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string, workspaceId?: string) {
  const where: { userId: string; read: boolean; workspaceId?: string } = {
    userId,
    read: false,
  };
  if (workspaceId) {
    where.workspaceId = workspaceId;
  }

  return prisma.notification.count({ where });
}
