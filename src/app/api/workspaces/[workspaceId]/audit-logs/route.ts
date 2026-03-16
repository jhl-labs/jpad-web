import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { checkWorkspaceAccess, requireAuth } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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

    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const action = req.nextUrl.searchParams.get("action");
    const statusParam = req.nextUrl.searchParams.get("status");
    const query = req.nextUrl.searchParams.get("q")?.trim();
    const currentPage = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitParam || "50", 10) || 50));
    const skip = (currentPage - 1) * limit;

    const status =
      statusParam === "success" ||
      statusParam === "denied" ||
      statusParam === "error"
        ? statusParam
        : undefined;

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
      ...(searchFilters.length > 0 ? { OR: searchFilters } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        action: action || null,
        status: status || null,
        q: query || null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError(
      "workspace.audit_logs.fetch_failed",
      error,
      { workspaceId },
      req
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
