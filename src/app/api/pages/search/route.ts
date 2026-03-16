import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAuth } from "@/lib/auth/helpers";
import { rateLimitRedis } from "@/lib/rateLimit";
import { listAccessiblePages } from "@/lib/pageAccess";
import {
  extractPlainTextFromMarkdown,
  getSemanticSearchResults,
} from "@/lib/semanticSearch";

const MAX_RESULTS = 20;
const SNIPPET_CONTEXT = 50;
const MAX_FILES = 500;

interface ContentMatch {
  slug: string;
  snippet: string;
}

type MatchType = "recent" | "title" | "content" | "semantic";

interface RankedResult {
  id: string;
  title: string | null;
  slug: string;
  icon: string | null;
  snippet: string | null;
  matchType: MatchType;
  score: number;
}

function getRecencyScore(updatedAt: Date) {
  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 12 - ageDays / 5);
}

async function searchContent(
  workspaceId: string,
  query: string,
  allowedSlugs: Set<string>
): Promise<ContentMatch[]> {
  const baseRepoDir = path.join(process.cwd(), "data", "repos");
  const repoDir = path.resolve(baseRepoDir, workspaceId);
  if (!repoDir.startsWith(baseRepoDir)) {
    return []; // path traversal defense
  }
  const results: ContentMatch[] = [];

  try {
    const files = await fs.promises.readdir(repoDir);
    const mdFiles = files
      .filter((f) => f.endsWith(".md"))
      .filter((f) => allowedSlugs.has(f.replace(/\.md$/, "")))
      .slice(0, MAX_FILES);
    const lowerQuery = query.toLowerCase();

    for (const file of mdFiles) {
      const markdown = await fs.promises.readFile(
        path.join(repoDir, file),
        "utf-8"
      );
      const content = extractPlainTextFromMarkdown(markdown);
      const lowerContent = content.toLowerCase();
      const idx = lowerContent.indexOf(lowerQuery);

      if (idx !== -1) {
        const start = Math.max(0, idx - SNIPPET_CONTEXT);
        const end = Math.min(
          content.length,
          idx + query.length + SNIPPET_CONTEXT
        );
        let snippet = content.slice(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < content.length) snippet = snippet + "...";

        results.push({
          slug: file.replace(/\.md$/, ""),
          snippet,
        });
      }

      if (results.length >= MAX_RESULTS) break;
    }
  } catch {
    // repo directory might not exist yet
  }

  return results;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const allowed = await rateLimitRedis(`search:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";

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

    const accessibleSlugs = new Set(pages.map((page) => page.slug));
    const accessibleIds = new Set(pages.map((page) => page.id));

    // Empty query: return recent pages
    if (!q) {
      return NextResponse.json(
        [...pages]
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, MAX_RESULTS)
          .map((page) => ({
            id: page.id,
            title: page.title,
            slug: page.slug,
            icon: page.icon,
            snippet: null,
            matchType: "recent" as const,
          }))
      );
    }

    // 1. Title matches from DB (case-insensitive)
    const lowered = q.toLowerCase();
    const titleMatches = pages
      .filter(
        (page) =>
          page.title.toLowerCase().includes(lowered) ||
          page.slug.toLowerCase().includes(lowered)
      )
      .slice(0, MAX_RESULTS);

    const titleResults = titleMatches.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      icon: p.icon,
      snippet: null as string | null,
      matchType: "title" as const,
      score:
        (p.title.toLowerCase() === lowered ? 130 : 0) +
        (p.title.toLowerCase().startsWith(lowered) ? 95 : 0) +
        (p.title.toLowerCase().includes(lowered) ? 70 : 0) +
        (p.slug.toLowerCase().startsWith(lowered) ? 42 : 0) +
        (p.slug.toLowerCase().includes(lowered) ? 24 : 0) +
        getRecencyScore(p.updatedAt),
    }));

    // 2. Content matches from git markdown files
    const contentMatches = await searchContent(workspaceId, q, accessibleSlugs);

    // Slugs already matched by title
    const titleSlugs = new Set(titleMatches.map((p) => p.slug));

    // Look up page metadata for content matches (exclude title-matched pages)
    const contentSlugs = contentMatches
      .filter((c) => !titleSlugs.has(c.slug))
      .map((c) => c.slug);

    let contentResults: {
      id: string;
      title: string | null;
      slug: string;
      icon: string | null;
      snippet: string | null;
      matchType: "content";
      score: number;
    }[] = [];

    if (contentSlugs.length > 0) {
      const contentPages = pages
        .filter((page) => accessibleIds.has(page.id) && contentSlugs.includes(page.slug))
        .map(({ id, title, slug, icon }) => ({ id, title, slug, icon }));

      const pageBySlug = new Map(contentPages.map((p) => [p.slug, p]));

      contentResults = contentSlugs
        .filter((slug) => pageBySlug.has(slug))
        .map((slug) => {
          const page = pageBySlug.get(slug)!;
          const match = contentMatches.find((c) => c.slug === slug)!;
          return {
            ...page,
            snippet: match.snippet,
            matchType: "content" as const,
            score: 38 + getRecencyScore(
              pages.find((entry) => entry.id === page.id)?.updatedAt || new Date(0)
            ),
          };
        });
    }

    // Also add snippet to title matches if they had a content match too
    for (const result of titleResults) {
      const cm = contentMatches.find((c) => c.slug === result.slug);
      if (cm) {
        result.snippet = cm.snippet;
      }
    }

    const semanticResults = await getSemanticSearchResults(
      workspaceId,
      q,
      pages.map((page) => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        icon: page.icon,
        updatedAt: page.updatedAt,
      })),
      MAX_RESULTS
    );

    const semanticRanked = semanticResults.map((result) => ({
      ...result,
      score:
        result.score * 70 +
        getRecencyScore(
          pages.find((page) => page.id === result.id)?.updatedAt || new Date(0)
        ),
    }));

    const merged = new Map<string, RankedResult>();
    const candidates: RankedResult[] = [
      ...titleResults,
      ...contentResults,
      ...semanticRanked,
    ];

    for (const candidate of candidates) {
      const existing = merged.get(candidate.id);
      if (!existing) {
        merged.set(candidate.id, candidate);
        continue;
      }

      const nextScore = existing.score + candidate.score;
      const dominant = candidate.score > existing.score ? candidate : existing;
      merged.set(candidate.id, {
        ...dominant,
        snippet: dominant.snippet || existing.snippet || candidate.snippet,
        score: nextScore,
      });
    }

    const ranked = [...merged.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_RESULTS)
      .map(({ score: _score, ...result }) => result);

    return NextResponse.json(ranked);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
