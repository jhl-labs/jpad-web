import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();

    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const action = sp.get("action")?.trim() || "";
    const status = sp.get("status")?.trim() || "";
    const from = sp.get("from")?.trim() || "";
    const to = sp.get("to")?.trim() || "";
    const limitParam = parseInt(sp.get("limit") || "50", 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 200);
    const offsetParam = parseInt(sp.get("offset") || "0", 10);
    const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (q) {
      where.OR = [
        { actorEmail: { contains: q, mode: "insensitive" } },
        { actorName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
      ];
    }

    if (action) {
      where.action = action;
    }

    if (status && ["success", "denied", "error"].includes(status)) {
      where.status = status;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          // Include the entire end day
          toDate.setHours(23, 59, 59, 999);
          where.createdAt.lte = toDate;
        }
      }
      if (Object.keys(where.createdAt).length === 0) {
        delete where.createdAt;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logError("admin.auditLogs.list", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
