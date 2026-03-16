import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { enqueueAuditWebhookDelivery } from "@/lib/auditWebhook";
import {
  getRequestContext,
  type RequestContext,
} from "@/lib/requestContext";

export interface AuditActor {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

export interface AuditLogInput {
  action: string;
  status?: "success" | "denied" | "error";
  actor?: AuditActor | null;
  workspaceId?: string | null;
  pageId?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Prisma.InputJsonValue;
  context?: RequestContext | null;
}

export function createAuditActor(
  user: { id: string; email?: string | null; name?: string | null },
  role?: string | null
): AuditActor {
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    role: role ?? null,
  };
}

export function getAuditRequestContext(
  reqOrHeaders?: NextRequest | Headers | null
) {
  return getRequestContext(reqOrHeaders);
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  if (process.env.DISABLE_AUDIT_LOGS === "1") {
    return;
  }

  try {
    const auditLog = await prisma.auditLog.create({
      data: {
        action: input.action,
        status: input.status ?? "success",
        requestId: input.context?.requestId ?? null,
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorName: input.actor?.name ?? null,
        actorRole: input.actor?.role ?? null,
        workspaceId: input.workspaceId ?? null,
        pageId: input.pageId ?? null,
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
        metadata: input.metadata,
      },
    });

    await enqueueAuditWebhookDelivery(auditLog);
  } catch (error) {
    logError("audit.log.write_failed", error, {
      action: input.action,
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      targetId: input.targetId,
    });
  }
}
