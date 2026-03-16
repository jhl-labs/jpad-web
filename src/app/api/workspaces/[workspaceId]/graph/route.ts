import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { listAccessiblePages } from "@/lib/pageAccess";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { pages } = await listAccessiblePages(user.id, workspaceId);

    const backlinks = await prisma.backlink.findMany({
      where: {
        fromPage: { workspaceId, isDeleted: false },
        toPage: { workspaceId, isDeleted: false },
      },
      select: { fromPageId: true, toPageId: true },
    });

    const pageIds = new Set(pages.map((p) => p.id));

    const nodes = pages.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      icon: p.icon || "",
      parentId: p.parentId || null,
    }));

    // Deduplicate edges using a set of "source->target" keys
    const edgeSet = new Set<string>();
    const edges: { source: string; target: string; type: "parent" | "backlink" }[] = [];

    // Parent-child edges
    for (const page of pages) {
      if (page.parentId && pageIds.has(page.parentId)) {
        const key = `${page.parentId}->${page.id}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: page.parentId, target: page.id, type: "parent" });
        }
      }
    }

    // Backlink edges
    for (const bl of backlinks) {
      if (pageIds.has(bl.fromPageId) && pageIds.has(bl.toPageId)) {
        const key = `${bl.fromPageId}->${bl.toPageId}`;
        const reverseKey = `${bl.toPageId}->${bl.fromPageId}`;
        if (!edgeSet.has(key) && !edgeSet.has(reverseKey)) {
          edgeSet.add(key);
          edges.push({ source: bl.fromPageId, target: bl.toPageId, type: "backlink" });
        }
      }
    }

    return NextResponse.json({ nodes, edges });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
