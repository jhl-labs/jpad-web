import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { listAccessiblePages } from "@/lib/pageAccess";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`graph:${user.id}`, 30, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId required" },
        { status: 400 }
      );
    }

    const { member, pages } = await listAccessiblePages(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [pageNodes, backlinks] = await Promise.all([
      Promise.resolve(pages.map((page) => ({
        id: page.id,
        title: page.title,
        icon: page.icon,
      }))),
      prisma.backlink.findMany({
        where: {
          fromPage: { workspaceId, isDeleted: false },
          toPage: { workspaceId, isDeleted: false },
        },
        select: { fromPageId: true, toPageId: true },
      }),
    ]);

    const nodes = pageNodes.map((p) => ({
      id: p.id,
      title: p.title,
      icon: p.icon || "",
    }));

    const pageIds = new Set(pageNodes.map((p) => p.id));
    const edges = backlinks
      .filter((b) => pageIds.has(b.fromPageId) && pageIds.has(b.toPageId))
      .map((b) => ({
        source: b.fromPageId,
        target: b.toPageId,
      }));

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("graph.get.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
