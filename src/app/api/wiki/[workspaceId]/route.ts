import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPage } from "@/lib/git/repository";
import { markdownToHtml } from "@/lib/markdown/serializer";
import { listAccessiblePages } from "@/lib/pageAccess";
import { getWorkspaceViewAccess } from "@/lib/publicAccess";
import { rewriteWikiLinksForMarkdown } from "@/lib/wikiLinks";
import { logError } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { workspace, user, member } = await getWorkspaceViewAccess(workspaceId);

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!member && !workspace.publicWikiEnabled) {
      return NextResponse.json(
        { error: user ? "Forbidden" : "Unauthorized" },
        { status: user ? 403 : 401 }
      );
    }

    const pageSlug = req.nextUrl.searchParams.get("page");

    const accessiblePages = member && user
      ? (await listAccessiblePages(user.id, workspaceId)).pages
      : [];

    if (pageSlug) {
      // Export single page
      const page = await prisma.page.findFirst({
        where: {
          workspaceId,
          slug: pageSlug,
          isDeleted: false,
          ...(member ? {} : { accessMode: "workspace" }),
        },
      });
      if (!page) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      if (member && !accessiblePages.some((entry) => entry.id === page.id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const content = await readPage(workspaceId, page.slug);
      const html = await markdownToHtml(
        rewriteWikiLinksForMarkdown(content || "", workspaceId)
      );

      return new NextResponse(wrapHtml(page.title, html), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Export all pages
    const pages = member
      ? await prisma.page.findMany({
          where: { id: { in: accessiblePages.map((page) => page.id) } },
          orderBy: { position: "asc" },
        })
      : await prisma.page.findMany({
          where: { workspaceId, isDeleted: false, accessMode: "workspace" },
          orderBy: { position: "asc" },
        });

    const htmlPages: { title: string; slug: string; html: string }[] = [];

    for (const page of pages) {
      const content = await readPage(workspaceId, page.slug);
      const html = await markdownToHtml(
        rewriteWikiLinksForMarkdown(content || "", workspaceId)
      );
      htmlPages.push({ title: page.title, slug: page.slug, html });
    }

    const indexHtml = generateWikiIndex(htmlPages);

    return new NextResponse(indexHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("wiki.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function wrapHtml(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - JPAD Wiki</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1a1a1a; }
    h1 { border-bottom: 2px solid #e5e5e5; padding-bottom: 0.5rem; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { display: block; padding: 1rem; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    a { color: #2563eb; }
    img { max-width: 100%; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function generateWikiIndex(
  pages: { title: string; slug: string; html: string }[]
) {
  const links = pages
    .map(
      (p) =>
        `<li><a href="?page=${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a></li>`
    )
    .join("\n");

  return wrapHtml(
    "Wiki Index",
    `<h1>Wiki</h1><ul>${links}</ul>`
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
