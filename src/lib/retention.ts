function parseRetentionDays(
  rawValue: string | undefined,
  fallback: number,
  min = 1,
  max = 3650
): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export interface RetentionConfig {
  trashRetentionDays: number;
  aiChatRetentionDays: number;
  revokedShareRetentionDays: number;
  auditLogRetentionDays: number;
}

export interface RetentionSummary {
  purgedPageCount: number;
  purgedAttachmentCount: number;
  purgedShareLinkCount: number;
  purgedAiChatCount: number;
  purgedAuditLogCount: number;
}

export interface WorkspaceRetentionSummary {
  workspaceId: string;
  purgedPageCount: number;
  purgedAttachmentCount: number;
  purgedShareLinkCount: number;
  purgedAiChatCount: number;
  purgedAuditLogCount: number;
}

export function getRetentionConfig(): RetentionConfig {
  return {
    trashRetentionDays: parseRetentionDays(process.env.TRASH_RETENTION_DAYS, 30),
    aiChatRetentionDays: parseRetentionDays(process.env.AI_CHAT_RETENTION_DAYS, 90),
    revokedShareRetentionDays: parseRetentionDays(
      process.env.REVOKED_SHARE_RETENTION_DAYS,
      30
    ),
    auditLogRetentionDays: parseRetentionDays(
      process.env.AUDIT_LOG_RETENTION_DAYS,
      365
    ),
  };
}

export function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}
