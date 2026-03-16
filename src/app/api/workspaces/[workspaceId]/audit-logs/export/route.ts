import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { checkWorkspaceAccess, requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  try {
    const user = await requireAuth();

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formatParam = req.nextUrl.searchParams.get("format");
    const action = req.nextUrl.searchParams.get("action");
    const statusParam = req.nextUrl.searchParams.get("status");
    const query = req.nextUrl.searchParams.get("q")?.trim();
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const format = formatParam === "csv" ? "csv" : "ndjson";
    const limit = Math.min(5_000, Math.max(1, Number.parseInt(limitParam || "1000", 10) || 1000));

    const status =
      statusParam === "success" ||
      statusParam === "denied" ||
      statusParam === "error"
        ? statusParam
        : undefined;

    const fromDate = fromParam ? new Date(fromParam) : null;
    const toDate = toParam ? new Date(toParam) : null;
    const hasValidFrom = fromDate && !Number.isNaN(fromDate.getTime());
    const hasValidTo = toDate && !Number.isNaN(toDate.getTime());

    const searchFilters: Prisma.AuditLogWhereInput[] = query
      ? [
          { action: { contains: query, mode: "insensitive" } },
          { actorEmail: { contains: query, mode: "insensitive" } },
          { actorName: { contains: query, mode: "insensitive" } },
          { targetId: { contains: query, mode: "insensitive" } },
          { targetType: { contains: query, mode: "insensitive" } },
          { requestId: { contains: query, mode: "insensitive" } },
        ]
      : [];

    const where: Prisma.AuditLogWhereInput = {
      workspaceId,
      ...(action ? { action } : {}),
      ...(status ? { status } : {}),
      ...(hasValidFrom || hasValidTo
        ? {
            createdAt: {
              ...(hasValidFrom ? { gte: fromDate as Date } : {}),
              ...(hasValidTo ? { lte: toDate as Date } : {}),
            },
          }
        : {}),
      ...(searchFilters.length > 0 ? { OR: searchFilters } : {}),
    };

    const [workspace, logs] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { slug: true },
      }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
    ]);

    const filenameBase = `${workspace?.slug || workspaceId}-audit-logs-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}`;

    if (format === "csv") {
      const rows = [
        [
          "id",
          "createdAt",
          "action",
          "status",
          "requestId",
          "actorEmail",
          "actorName",
          "actorRole",
          "pageId",
          "targetType",
          "targetId",
          "ipAddress",
          "userAgent",
          "metadata",
        ].join(","),
        ...logs.map((log) =>
          [
            log.id,
            log.createdAt.toISOString(),
            log.action,
            log.status,
            log.requestId,
            log.actorEmail,
            log.actorName,
            log.actorRole,
            log.pageId,
            log.targetType,
            log.targetId,
            log.ipAddress,
            log.userAgent,
            log.metadata,
          ]
            .map(escapeCsv)
            .join(",")
        ),
      ];

      return new NextResponse(`${rows.join("\n")}\n`, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filenameBase}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    const lines = logs.map((log) =>
      JSON.stringify({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        action: log.action,
        status: log.status,
        requestId: log.requestId,
        actorId: log.actorId,
        actorEmail: log.actorEmail,
        actorName: log.actorName,
        actorRole: log.actorRole,
        workspaceId: log.workspaceId,
        pageId: log.pageId,
        targetType: log.targetType,
        targetId: log.targetId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.metadata,
      })
    );

    return new NextResponse(`${lines.join("\n")}\n`, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="${filenameBase}.ndjson"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError(
      "workspace.audit_logs.export_failed",
      error,
      { workspaceId },
      req
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
