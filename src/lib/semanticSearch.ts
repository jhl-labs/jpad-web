import { createHash } from "node:crypto";
import { WorkspaceAiProfile } from "@/lib/aiConfig";
import { readPage } from "@/lib/git/repository";
import { resolveAiProfileForTask } from "@/lib/aiSettings";
import { embedTextWithProfile, supportsEmbeddings } from "@/lib/llmProviders";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { deletePageEmbeddings, replacePageEmbeddings, searchSimilarEmbeddings } from "@/lib/vectorStore";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";

const MAX_CHARS_PER_CHUNK = 900;
const MIN_CHARS_PER_CHUNK = 220;
const MAX_CHUNKS_PER_PAGE = 24;
const MAX_EMBEDDING_CANDIDATES = 4000;
const MIN_SEMANTIC_SCORE = 0.18;

export interface SearchablePage {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  updatedAt: Date;
}

export interface SemanticChunkMatch {
  pageId: string;
  title: string;
  slug: string;
  icon: string | null;
  snippet: string;
  score: number;
  content: string;
}

export interface WorkspaceEmbeddingReindexSummary {
  workspaceId: string;
  totalPages: number;
  indexedPages: number;
  emptyPages: number;
  disabledPages: number;
  clearedPages: number;
  errorPages: number;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractPlainTextFromMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongSegment(segment: string) {
  if (segment.length <= MAX_CHARS_PER_CHUNK) {
    return [segment];
  }

  const pieces: string[] = [];
  let cursor = 0;

  while (cursor < segment.length && pieces.length < MAX_CHUNKS_PER_PAGE) {
    const remaining = segment.slice(cursor);
    if (remaining.length <= MAX_CHARS_PER_CHUNK) {
      pieces.push(remaining.trim());
      break;
    }

    const slice = remaining.slice(0, MAX_CHARS_PER_CHUNK);
    const splitAt = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf(" ")
    );
    const end = splitAt > MIN_CHARS_PER_CHUNK ? splitAt + 1 : MAX_CHARS_PER_CHUNK;
    pieces.push(remaining.slice(0, end).trim());
    cursor += end;
  }

  return pieces.filter(Boolean);
}

function buildChunks(title: string, markdown: string) {
  const plainText = extractPlainTextFromMarkdown(markdown);
  if (!plainText) {
    return [];
  }

  const paragraphs = plainText
    .split(/\n{2,}/)
    .map((segment) => collapseWhitespace(segment))
    .filter(Boolean);
  const normalizedSegments = (paragraphs.length > 0 ? paragraphs : [plainText])
    .flatMap((segment) => splitLongSegment(segment));

  const chunks: string[] = [];
  let current = "";

  for (const segment of normalizedSegments) {
    const candidate = current ? `${current}\n\n${segment}` : segment;

    if (candidate.length <= MAX_CHARS_PER_CHUNK || current.length < MIN_CHARS_PER_CHUNK) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = segment;

    if (chunks.length >= MAX_CHUNKS_PER_PAGE) {
      break;
    }
  }

  if (current && chunks.length < MAX_CHUNKS_PER_PAGE) {
    chunks.push(current);
  }

  return chunks
    .map((content, chunkIndex) => ({
      chunkIndex,
      title,
      content: collapseWhitespace(content),
      contentHash: createHash("sha256").update(content).digest("hex"),
    }))
    .filter((chunk) => chunk.content.length >= 40);
}

function buildSnippet(content: string, query: string, radius = 110) {
  const normalizedContent = collapseWhitespace(content);
  if (!normalizedContent) return "";

  const lowerContent = normalizedContent.toLowerCase();
  const lowerQuery = collapseWhitespace(query).toLowerCase();
  const matchIndex = lowerQuery ? lowerContent.indexOf(lowerQuery) : -1;

  if (matchIndex === -1) {
    return normalizedContent.length > radius * 2
      ? `${normalizedContent.slice(0, radius * 2).trim()}...`
      : normalizedContent;
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(normalizedContent.length, matchIndex + lowerQuery.length + radius);
  return `${start > 0 ? "..." : ""}${normalizedContent.slice(start, end).trim()}${
    end < normalizedContent.length ? "..." : ""
  }`;
}

async function getEmbeddingRuntime(workspaceId: string) {
  const settings = await getEffectiveWorkspaceSettings(workspaceId);
  if (!settings.aiEnabled) {
    return null;
  }

  const profile = resolveAiProfileForTask(
    settings.aiProfiles,
    settings.aiTaskRouting,
    "embedding"
  );
  if (!profile || !profile.enabled || !profile.model.trim()) {
    return null;
  }
  if (!supportsEmbeddings(profile)) {
    return null;
  }

  return profile;
}

async function reindexPageEmbeddingsWithProfile(
  profile: WorkspaceAiProfile | null,
  input: {
    workspaceId: string;
    pageId: string;
    slug: string;
    title: string;
    content?: string | null;
  }
) {
  if (!profile) {
    await removePageEmbeddings([input.pageId]);
    return { status: "disabled" as const };
  }

  const sourceContent =
    typeof input.content === "string" ? input.content : await readPage(input.workspaceId, input.slug);
  if (!sourceContent?.trim()) {
    await removePageEmbeddings([input.pageId]);
    return { status: "empty" as const };
  }

  const chunks = buildChunks(input.title, sourceContent);
  if (chunks.length === 0) {
    await removePageEmbeddings([input.pageId]);
    return { status: "empty" as const };
  }

  try {
    const embeddings: Array<
      ReturnType<typeof buildChunks>[number] & { embedding: number[] }
    > = [];

    for (const chunk of chunks) {
      const embedding = await embedTextWithProfile(
        profile,
        `${input.title}\n\n${chunk.content}`,
        "document"
      );
      embeddings.push({
        ...chunk,
        embedding,
      });
    }

    await replacePageEmbeddings({
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      provider: profile.provider,
      model: profile.model,
      chunks: embeddings,
    });

    return { status: "indexed" as const, chunkCount: embeddings.length };
  } catch (error) {
    logError("semantic.index.failed", error, {
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      provider: profile.provider,
      model: profile.model,
    });
    return { status: "error" as const };
  }
}

export async function removePageEmbeddings(pageIds: string[]) {
  if (pageIds.length === 0) return;
  await deletePageEmbeddings(pageIds);
}

export async function reindexPageEmbeddings(input: {
  workspaceId: string;
  pageId: string;
  slug: string;
  title: string;
  content?: string | null;
}) {
  const profile = await getEmbeddingRuntime(input.workspaceId);
  return reindexPageEmbeddingsWithProfile(profile, input);
}

export async function reindexWorkspaceEmbeddings(
  workspaceId: string,
  options: {
    dryRun?: boolean;
    pageId?: string | null;
    limit?: number;
  } = {}
): Promise<WorkspaceEmbeddingReindexSummary> {
  const pages = await prisma.page.findMany({
    where: {
      workspaceId,
      isDeleted: false,
      ...(options.pageId ? { id: options.pageId } : {}),
    },
    select: {
      id: true,
      slug: true,
      title: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: options.limit,
  });

  const profile = await getEmbeddingRuntime(workspaceId);
  const summary: WorkspaceEmbeddingReindexSummary = {
    workspaceId,
    totalPages: pages.length,
    indexedPages: 0,
    emptyPages: 0,
    disabledPages: 0,
    clearedPages: 0,
    errorPages: 0,
  };

  if (!profile) {
    summary.disabledPages = pages.length;
    if (!options.dryRun) {
      await removePageEmbeddings(pages.map((page) => page.id));
      summary.clearedPages = pages.length;
    }
    return summary;
  }

  for (const page of pages) {
    if (options.dryRun) {
      const content = await readPage(workspaceId, page.slug);
      if (!content?.trim()) {
        summary.emptyPages += 1;
      } else {
        summary.indexedPages += 1;
      }
      continue;
    }

    const result = await reindexPageEmbeddingsWithProfile(profile, {
      workspaceId,
      pageId: page.id,
      slug: page.slug,
      title: page.title,
    });

    if (result.status === "indexed") {
      summary.indexedPages += 1;
    } else if (result.status === "empty") {
      summary.emptyPages += 1;
      summary.clearedPages += 1;
    } else if (result.status === "disabled") {
      summary.disabledPages += 1;
      summary.clearedPages += 1;
    } else {
      summary.errorPages += 1;
    }
  }

  return summary;
}

export async function findRelevantDocumentChunks(
  workspaceId: string,
  query: string,
  pages: SearchablePage[],
  limit = 8
): Promise<SemanticChunkMatch[]> {
  const normalizedQuery = collapseWhitespace(query);
  if (!normalizedQuery || pages.length === 0) {
    return [];
  }

  const profile = await getEmbeddingRuntime(workspaceId);
  if (!profile) {
    return [];
  }

  try {
    const queryEmbedding = await embedTextWithProfile(profile, normalizedQuery, "query");
    const chunks = await searchSimilarEmbeddings({
      workspaceId,
      pageIds: pages.map((page) => page.id),
      queryEmbedding,
      limit: MAX_EMBEDDING_CANDIDATES,
      candidateLimit: MAX_EMBEDDING_CANDIDATES,
    });

    return chunks
      .map((chunk) => ({
        pageId: chunk.pageId,
        title: chunk.title,
        slug: chunk.slug,
        icon: chunk.icon,
        snippet: buildSnippet(chunk.content, normalizedQuery),
        score: chunk.score,
        content: chunk.content,
      }))
      .filter((chunk) => chunk.score >= MIN_SEMANTIC_SCORE)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  } catch (error) {
    logError("semantic.search.failed", error, {
      workspaceId,
      pageCount: pages.length,
    });
    return [];
  }
}

export async function getSemanticSearchResults(
  workspaceId: string,
  query: string,
  pages: SearchablePage[],
  limit = 8
) {
  const chunkMatches = await findRelevantDocumentChunks(workspaceId, query, pages, limit * 3);
  const byPage = new Map<string, SemanticChunkMatch>();

  for (const match of chunkMatches) {
    const existing = byPage.get(match.pageId);
    if (!existing || match.score > existing.score) {
      byPage.set(match.pageId, match);
    }
  }

  return [...byPage.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((match) => ({
      id: match.pageId,
      title: match.title,
      slug: match.slug,
      icon: match.icon,
      snippet: match.snippet,
      matchType: "semantic" as const,
      score: match.score,
    }));
}

export function buildSemanticContext(matches: SemanticChunkMatch[]) {
  if (matches.length === 0) {
    return "";
  }

  return matches
    .map(
      (match, index) =>
        `### Context ${index + 1}: ${match.title}\n${match.content}`
    )
    .join("\n\n---\n\n");
}

export async function findRelatedPages(
  input: {
    workspaceId: string;
    pageId: string;
    title: string;
    content?: string | null;
  },
  pages: SearchablePage[],
  limit = 5
) {
  const queryText = collapseWhitespace(
    `${input.title}\n\n${extractPlainTextFromMarkdown(input.content || "").slice(0, 1600)}`
  );
  if (!queryText) {
    return [];
  }

  const matches = await getSemanticSearchResults(
    input.workspaceId,
    queryText,
    pages.filter((page) => page.id !== input.pageId),
    limit
  );

  return matches.filter((entry) => entry.id !== input.pageId).slice(0, limit);
}
