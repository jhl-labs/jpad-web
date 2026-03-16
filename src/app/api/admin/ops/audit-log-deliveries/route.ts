import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { getAuditWebhookRuntimeStatus } from "@/lib/auditWebhook";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();

    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const statusParam = req.nextUrl.searchParams.get("status");
    const currentPage = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam || "20", 10) || 20));
    const skip = (currentPage - 1) * limit;

    const status =
      statusParam === "pending" ||
      statusParam === "delivered" ||
      statusParam === "error"
        ? statusParam
        : undefined;

    const where: Prisma.AuditLogWebhookDeliveryWhereInput = {
      ...(status ? { status } : {}),
    };

    const [deliveries, total, runtimeStatus] = await Promise.all([
      prisma.auditLogWebhookDelivery.findMany({
        where,
        include: {
          auditLog: {
            select: {
              action: true,
              workspaceId: true,
              pageId: true,
              actorEmail: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.auditLogWebhookDelivery.count({ where }),
      getAuditWebhookRuntimeStatus(),
    ]);

    return NextResponse.json({
      data: deliveries.map((delivery) => ({
        id: delivery.id,
        destinationType: delivery.destinationType,
        destinationLabel: delivery.destinationLabel,
        status: delivery.status,
        attempts: delivery.attempts,
        nextAttemptAt: delivery.nextAttemptAt,
        lastAttemptAt: delivery.lastAttemptAt,
        deliveredAt: delivery.deliveredAt,
        responseStatus: delivery.responseStatus,
        lastError: delivery.lastError,
        createdAt: delivery.createdAt,
        auditLog: delivery.auditLog,
      })),
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: status || null,
      },
      runtimeStatus,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    logError("admin.ops.audit_log_deliveries.fetch_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
