import { createHmac } from "crypto";
import { type AuditLog, type Prisma } from "@prisma/client";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_LIMIT = 50;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_BACKOFF_SECONDS = 3_600;

export interface AuditWebhookConfig {
  enabled: boolean;
  url: string | null;
  secret: string | null;
  label: string;
  timeoutMs: number;
  batchLimit: number;
  maxAttempts: number;
}

export interface AuditWebhookPayload {
  source: "jpad.audit_log";
  version: 1;
  event: {
    id: string;
    action: string;
    status: string;
    requestId: string | null;
    actorId: string | null;
    actorEmail: string | null;
    actorName: string | null;
    actorRole: string | null;
    workspaceId: string | null;
    pageId: string | null;
    targetId: string | null;
    targetType: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: string;
  };
}

export interface ProcessAuditWebhookDeliveriesOptions {
  limit?: number;
  trigger?: string;
}

export interface ProcessAuditWebhookDeliveriesResult {
  enabled: boolean;
  destinationLabel: string | null;
  trigger: string;
  limit: number;
  processedCount: number;
  deliveredCount: number;
  errorCount: number;
  pendingCount: number;
  skippedCount: number;
}

function parseInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getAuditWebhookConfig(): AuditWebhookConfig {
  const url = process.env.AUDIT_LOG_WEBHOOK_URL?.trim() || null;

  return {
    enabled: Boolean(url) && process.env.DISABLE_AUDIT_LOG_WEBHOOK !== "1",
    url,
    secret: process.env.AUDIT_LOG_WEBHOOK_SECRET?.trim() || null,
    label: process.env.AUDIT_LOG_WEBHOOK_LABEL?.trim() || "primary",
    timeoutMs: parseInteger(
      process.env.AUDIT_LOG_WEBHOOK_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1_000,
      120_000
    ),
    batchLimit: parseInteger(
      process.env.AUDIT_LOG_WEBHOOK_BATCH_LIMIT,
      DEFAULT_BATCH_LIMIT,
      1,
      200
    ),
    maxAttempts: parseInteger(
      process.env.AUDIT_LOG_WEBHOOK_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
      1,
      20
    ),
  };
}

export function buildAuditWebhookPayload(auditLog: AuditLog): AuditWebhookPayload {
  return {
    source: "jpad.audit_log",
    version: 1,
    event: {
      id: auditLog.id,
      action: auditLog.action,
      status: auditLog.status,
      requestId: auditLog.requestId,
      actorId: auditLog.actorId,
      actorEmail: auditLog.actorEmail,
      actorName: auditLog.actorName,
      actorRole: auditLog.actorRole,
      workspaceId: auditLog.workspaceId,
      pageId: auditLog.pageId,
      targetId: auditLog.targetId,
      targetType: auditLog.targetType,
      ipAddress: auditLog.ipAddress,
      userAgent: auditLog.userAgent,
      metadata: (auditLog.metadata as Prisma.JsonValue | null) ?? null,
      createdAt: auditLog.createdAt.toISOString(),
    },
  };
}

export async function enqueueAuditWebhookDelivery(auditLog: AuditLog): Promise<void> {
  const config = getAuditWebhookConfig();
  if (!config.enabled) {
    return;
  }

  try {
    await prisma.auditLogWebhookDelivery.create({
      data: {
        auditLogId: auditLog.id,
        destinationType: "webhook",
        destinationLabel: config.label,
        payload: buildAuditWebhookPayload(auditLog) as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logError("audit.webhook.enqueue_failed", error, {
      auditLogId: auditLog.id,
      action: auditLog.action,
      destinationLabel: config.label,
    });
  }
}

function getRetryDelaySeconds(attemptNumber: number) {
  return Math.min(2 ** Math.max(0, attemptNumber - 1) * 60, MAX_BACKOFF_SECONDS);
}

function buildSignature(secret: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function truncateErrorMessage(value: string) {
  return value.length > 2_000 ? `${value.slice(0, 1_997)}...` : value;
}

function formatFetchError(error: unknown) {
  if (error instanceof Error) return truncateErrorMessage(error.message);
  return truncateErrorMessage(String(error));
}

async function deliverWebhook(
  delivery: {
    id: string;
    payload: Prisma.JsonValue;
  },
  config: AuditWebhookConfig
) {
  if (!config.url) {
    throw new Error("AUDIT_LOG_WEBHOOK_URL is not configured");
  }

  const body = JSON.stringify(delivery.payload);
  const headers: HeadersInit = {
    "content-type": "application/json",
    "user-agent": "jpad-audit-webhook/1.0",
    "x-jpad-delivery-id": delivery.id,
    "x-jpad-destination-label": config.label,
  };

  if (config.secret) {
    headers["x-jpad-signature"] = buildSignature(config.secret, body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    return await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function processAuditWebhookDeliveries(
  options: ProcessAuditWebhookDeliveriesOptions = {}
): Promise<ProcessAuditWebhookDeliveriesResult> {
  const config = getAuditWebhookConfig();
  const trigger = options.trigger || "manual";
  const limit = Math.min(
    config.batchLimit,
    Math.max(1, options.limit || config.batchLimit)
  );

  if (!config.enabled) {
    return {
      enabled: false,
      destinationLabel: null,
      trigger,
      limit,
      processedCount: 0,
      deliveredCount: 0,
      errorCount: 0,
      pendingCount: 0,
      skippedCount: 0,
    };
  }

  const now = new Date();
  const deliveries = await prisma.auditLogWebhookDelivery.findMany({
    where: {
      destinationType: "webhook",
      destinationLabel: config.label,
      deliveredAt: null,
      nextAttemptAt: { lte: now },
      attempts: { lt: config.maxAttempts },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  let deliveredCount = 0;
  let errorCount = 0;
  let pendingCount = 0;

  for (const delivery of deliveries) {
    const nextAttemptNumber = delivery.attempts + 1;

    try {
      const response = await deliverWebhook(delivery, config);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await prisma.auditLogWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "delivered",
          attempts: nextAttemptNumber,
          responseStatus: response.status,
          deliveredAt: new Date(),
          lastAttemptAt: new Date(),
          nextAttemptAt: new Date(),
          lastError: null,
        },
      });

      deliveredCount += 1;
    } catch (error) {
      const lastError = formatFetchError(error);
      const exhausted = nextAttemptNumber >= config.maxAttempts;
      const retryAt = new Date(
        Date.now() + getRetryDelaySeconds(nextAttemptNumber) * 1_000
      );

      await prisma.auditLogWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: exhausted ? "error" : "pending",
          attempts: nextAttemptNumber,
          lastAttemptAt: new Date(),
          nextAttemptAt: exhausted ? retryAt : retryAt,
          lastError,
        },
      });

      if (exhausted) {
        errorCount += 1;
      } else {
        pendingCount += 1;
      }

      logError("audit.webhook.delivery_failed", error, {
        deliveryId: delivery.id,
        attempt: nextAttemptNumber,
        destinationLabel: config.label,
        exhausted,
      });
    }
  }

  logInfo("audit.webhook.processed", {
    trigger,
    destinationLabel: config.label,
    processedCount: deliveries.length,
    deliveredCount,
    errorCount,
    pendingCount,
  });

  return {
    enabled: true,
    destinationLabel: config.label,
    trigger,
    limit,
    processedCount: deliveries.length,
    deliveredCount,
    errorCount,
    pendingCount,
    skippedCount: 0,
  };
}

export async function getAuditWebhookRuntimeStatus() {
  const config = getAuditWebhookConfig();
  const [pendingCount, errorCount, deliveredCount, latestDelivered] = config.enabled
    ? await Promise.all([
        prisma.auditLogWebhookDelivery.count({
          where: {
            destinationType: "webhook",
            destinationLabel: config.label,
            deliveredAt: null,
            attempts: { lt: config.maxAttempts },
          },
        }),
        prisma.auditLogWebhookDelivery.count({
          where: {
            destinationType: "webhook",
            destinationLabel: config.label,
            status: "error",
          },
        }),
        prisma.auditLogWebhookDelivery.count({
          where: {
            destinationType: "webhook",
            destinationLabel: config.label,
            status: "delivered",
          },
        }),
        prisma.auditLogWebhookDelivery.findFirst({
          where: {
            destinationType: "webhook",
            destinationLabel: config.label,
            status: "delivered",
          },
          orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            deliveredAt: true,
            auditLog: {
              select: {
                action: true,
                workspaceId: true,
              },
            },
          },
        }),
      ])
    : [0, 0, 0, null];

  return {
    enabled: config.enabled,
    label: config.label,
    urlConfigured: Boolean(config.url),
    maxAttempts: config.maxAttempts,
    batchLimit: config.batchLimit,
    timeoutMs: config.timeoutMs,
    pendingCount,
    errorCount,
    deliveredCount,
    latestDelivered: latestDelivered
      ? {
          id: latestDelivered.id,
          deliveredAt: latestDelivered.deliveredAt?.toISOString() || null,
          action: latestDelivered.auditLog.action,
          workspaceId: latestDelivered.auditLog.workspaceId,
        }
      : null,
  };
}
