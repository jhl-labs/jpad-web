import { Prisma } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";

export interface PageEmbeddingChunkInput {
  chunkIndex: number;
  title: string;
  content: string;
  contentHash: string;
  embedding: number[];
}

export interface VectorSearchMatch {
  pageId: string;
  title: string;
  slug: string;
  icon: string | null;
  content: string;
  score: number;
}

export type VectorStoreBackend = "json" | "pgvector" | "qdrant";

export interface VectorStoreRuntimeStatus {
  configuredBackend: VectorStoreBackend;
  effectiveReadBackend: VectorStoreBackend;
  fallbackActive: boolean;
  helperTable: string | null;
  pgvector: {
    ready: boolean;
    checkedAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    autoInitEnabled: boolean;
  };
  qdrant: {
    ready: boolean;
    checkedAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    autoInitEnabled: boolean;
    collectionPrefix: string;
    collectionCount: number;
    collectionNames: string[];
  };
  counts: {
    jsonChunkCount: number;
    vectorChunkCount: number | null;
  };
  workspaceCounts: {
    workspaceId: string;
    jsonChunkCount: number;
    vectorChunkCount: number | null;
  } | null;
}

interface QdrantCollectionsResponse {
  result?: {
    collections?: Array<{
      name?: string;
    }>;
  };
}

interface QdrantCountResponse {
  result?: {
    count?: number;
  };
}

interface QdrantSearchResponse {
  result?:
    | Array<{
        id?: string | number;
        score?: number;
        payload?: Record<string, unknown> | null;
      }>
    | {
        points?: Array<{
          id?: string | number;
          score?: number;
          payload?: Record<string, unknown> | null;
        }>;
      };
}

const PGVECTOR_TABLE = "page_embedding_vector_chunks";
const PGVECTOR_RETRY_INTERVAL_MS = 60_000;
const QDRANT_RETRY_INTERVAL_MS = 30_000;
const DEFAULT_QDRANT_COLLECTION_PREFIX = "jpad_page_embeddings";
const QDRANT_POINT_NAMESPACE = "f5f85c72-6b7d-49de-9d8f-8cb68cf5a6f2";

let pgvectorReadyPromise: Promise<boolean> | null = null;
let qdrantReadyPromise: Promise<boolean> | null = null;

const pgvectorRuntimeState: {
  checkedAtMs: number | null;
  checkedAt: string | null;
  ready: boolean;
  lastError: string | null;
  lastErrorCode: string | null;
} = {
  checkedAtMs: null,
  checkedAt: null,
  ready: false,
  lastError: null,
  lastErrorCode: null,
};

const qdrantRuntimeState: {
  checkedAtMs: number | null;
  checkedAt: string | null;
  ready: boolean;
  lastError: string | null;
  lastErrorCode: string | null;
  collectionNames: string[];
} = {
  checkedAtMs: null,
  checkedAt: null,
  ready: false,
  lastError: null,
  lastErrorCode: null,
  collectionNames: [],
};

function getVectorStoreBackend(): VectorStoreBackend {
  if (process.env.VECTOR_STORE_BACKEND === "pgvector") {
    return "pgvector";
  }
  if (process.env.VECTOR_STORE_BACKEND === "qdrant") {
    return "qdrant";
  }
  return "json";
}

function isPgvectorAutoInitEnabled() {
  return process.env.PGVECTOR_AUTO_INIT !== "0";
}

function getQdrantBaseUrl() {
  const value = process.env.QDRANT_URL?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

function isQdrantAutoInitEnabled() {
  return process.env.QDRANT_AUTO_INIT !== "0";
}

function getQdrantCollectionPrefix() {
  const raw = process.env.QDRANT_COLLECTION_PREFIX?.trim() || DEFAULT_QDRANT_COLLECTION_PREFIX;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function getQdrantTimeoutMs() {
  const parsed = Number.parseInt(process.env.QDRANT_TIMEOUT_MS || "10000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

function updatePgvectorRuntimeState(input: {
  ready: boolean;
  error?: unknown;
}) {
  const now = new Date();
  pgvectorRuntimeState.checkedAtMs = now.getTime();
  pgvectorRuntimeState.checkedAt = now.toISOString();
  pgvectorRuntimeState.ready = input.ready;

  if (input.ready) {
    pgvectorRuntimeState.lastError = null;
    pgvectorRuntimeState.lastErrorCode = null;
    return;
  }

  if (input.error instanceof Error) {
    pgvectorRuntimeState.lastError = input.error.message;
  } else if (typeof input.error === "string") {
    pgvectorRuntimeState.lastError = input.error;
  } else {
    pgvectorRuntimeState.lastError = "Unknown pgvector initialization error";
  }

  const errorWithCode =
    input.error && typeof input.error === "object" && "code" in input.error
      ? (input.error as { code?: unknown })
      : null;
  pgvectorRuntimeState.lastErrorCode =
    typeof errorWithCode?.code === "string" ? errorWithCode.code : null;
}

function updateQdrantRuntimeState(input: {
  ready: boolean;
  error?: unknown;
  collectionNames?: string[];
}) {
  const now = new Date();
  qdrantRuntimeState.checkedAtMs = now.getTime();
  qdrantRuntimeState.checkedAt = now.toISOString();
  qdrantRuntimeState.ready = input.ready;
  if (Array.isArray(input.collectionNames)) {
    qdrantRuntimeState.collectionNames = input.collectionNames;
  }

  if (input.ready) {
    qdrantRuntimeState.lastError = null;
    qdrantRuntimeState.lastErrorCode = null;
    return;
  }

  if (input.error instanceof Error) {
    qdrantRuntimeState.lastError = input.error.message;
  } else if (typeof input.error === "string") {
    qdrantRuntimeState.lastError = input.error;
  } else {
    qdrantRuntimeState.lastError = "Unknown Qdrant initialization error";
  }

  const errorWithCode =
    input.error && typeof input.error === "object" && "code" in input.error
      ? (input.error as { code?: unknown })
      : null;
  qdrantRuntimeState.lastErrorCode =
    typeof errorWithCode?.code === "string" ? errorWithCode.code : null;
}

function toNumberArray(value: Prisma.JsonValue): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry));
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

function normalizeCountValue(value: unknown) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function qdrantCollectionNameForDimension(dimension: number) {
  return `${getQdrantCollectionPrefix()}_${dimension}`;
}

function qdrantPointId(pageId: string, chunkIndex: number) {
  return uuidv5(`${pageId}:${chunkIndex}`, QDRANT_POINT_NAMESPACE);
}

async function ensurePgvectorReady(options?: { force?: boolean }) {
  if (getVectorStoreBackend() !== "pgvector") {
    return false;
  }

  if (
    !options?.force &&
    !pgvectorReadyPromise &&
    pgvectorRuntimeState.checkedAtMs &&
    !pgvectorRuntimeState.ready &&
    Date.now() - pgvectorRuntimeState.checkedAtMs < PGVECTOR_RETRY_INTERVAL_MS
  ) {
    return false;
  }

  if (!options?.force && pgvectorReadyPromise) {
    return pgvectorReadyPromise;
  }

  if (options?.force) {
    pgvectorReadyPromise = null;
  }

  if (!pgvectorReadyPromise) {
    pgvectorReadyPromise = (async () => {
      try {
        if (isPgvectorAutoInitEnabled()) {
          await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS ${PGVECTOR_TABLE} (
              workspace_id text NOT NULL,
              page_id text NOT NULL REFERENCES "Page"(id) ON DELETE CASCADE,
              chunk_index integer NOT NULL,
              embedding vector NOT NULL,
              created_at timestamptz NOT NULL DEFAULT NOW(),
              updated_at timestamptz NOT NULL DEFAULT NOW(),
              PRIMARY KEY (page_id, chunk_index)
            )
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS ${PGVECTOR_TABLE}_workspace_page_idx
            ON ${PGVECTOR_TABLE} (workspace_id, page_id)
          `);
        } else {
          await prisma.$queryRawUnsafe(`SELECT 1 FROM ${PGVECTOR_TABLE} LIMIT 1`);
        }

        updatePgvectorRuntimeState({ ready: true });
        return true;
      } catch (error) {
        updatePgvectorRuntimeState({ ready: false, error });
        logError("vector.pgvector.init_failed", error, {
          backend: getVectorStoreBackend(),
        });
        return false;
      }
    })();
  }

  const ready = await pgvectorReadyPromise;
  if (!ready) {
    pgvectorReadyPromise = null;
  }
  return ready;
}

async function qdrantRequest<T>(
  path: string,
  init?: RequestInit & { bodyJson?: unknown }
): Promise<T> {
  const baseUrl = getQdrantBaseUrl();
  if (!baseUrl) {
    const error = new Error("QDRANT_URL is not configured");
    (error as Error & { code?: string }).code = "QDRANT_URL_MISSING";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getQdrantTimeoutMs());

  try {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.bodyJson !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const apiKey = process.env.QDRANT_API_KEY?.trim();
    if (apiKey) {
      headers.set("api-key", apiKey);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      body: init?.bodyJson === undefined ? init?.body : JSON.stringify(init.bodyJson),
      signal: controller.signal,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? ((await response.json().catch(() => null)) as T | null)
      : ((await response.text().catch(() => "")) as unknown as T);

    if (!response.ok) {
      let message = `Qdrant request failed with status ${response.status}`;
      if (payload && typeof payload === "object") {
        const payloadRecord = payload as Record<string, unknown>;
        const statusObject =
          payloadRecord.status && typeof payloadRecord.status === "object"
            ? (payloadRecord.status as Record<string, unknown>)
            : null;
        const errorMessage =
          typeof payloadRecord.error === "string"
            ? payloadRecord.error
            : typeof statusObject?.error === "string"
              ? statusObject.error
              : null;
        if (errorMessage) {
          message = errorMessage;
        }
      } else if (typeof payload === "string" && payload.trim()) {
        message = payload.trim();
      }

      const error = new Error(message) as Error & { code?: string; status?: number };
      error.code = `QDRANT_${response.status}`;
      error.status = response.status;
      throw error;
    }

    return (payload ?? ({} as T)) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchQdrantCollectionNames() {
  const response = await qdrantRequest<QdrantCollectionsResponse>("/collections", {
    method: "GET",
  });

  return (response.result?.collections || [])
    .map((collection) => collection.name)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .filter((value) => value.startsWith(getQdrantCollectionPrefix()));
}

async function ensureQdrantReady(options?: { force?: boolean }) {
  if (getVectorStoreBackend() !== "qdrant") {
    return false;
  }

  if (!getQdrantBaseUrl()) {
    updateQdrantRuntimeState({
      ready: false,
      error: "QDRANT_URL is not configured",
      collectionNames: [],
    });
    return false;
  }

  if (
    !options?.force &&
    !qdrantReadyPromise &&
    qdrantRuntimeState.checkedAtMs &&
    !qdrantRuntimeState.ready &&
    Date.now() - qdrantRuntimeState.checkedAtMs < QDRANT_RETRY_INTERVAL_MS
  ) {
    return false;
  }

  if (!options?.force && qdrantReadyPromise) {
    return qdrantReadyPromise;
  }

  if (options?.force) {
    qdrantReadyPromise = null;
  }

  if (!qdrantReadyPromise) {
    qdrantReadyPromise = (async () => {
      try {
        const collectionNames = await fetchQdrantCollectionNames();
        updateQdrantRuntimeState({
          ready: true,
          collectionNames,
        });
        return true;
      } catch (error) {
        updateQdrantRuntimeState({
          ready: false,
          error,
          collectionNames: [],
        });
        logError("vector.qdrant.init_failed", error, {
          backend: getVectorStoreBackend(),
        });
        return false;
      }
    })();
  }

  const ready = await qdrantReadyPromise;
  if (!ready) {
    qdrantReadyPromise = null;
  }
  return ready;
}

async function ensureQdrantPayloadIndex(collectionName: string, fieldName: string) {
  try {
    await qdrantRequest(`/collections/${collectionName}/index`, {
      method: "PUT",
      bodyJson: {
        field_name: fieldName,
        field_schema: "keyword",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("already exists")) {
      return;
    }
    throw error;
  }
}

async function ensureQdrantCollection(collectionName: string, dimension: number) {
  const ready = await ensureQdrantReady();
  if (!ready) {
    return false;
  }

  if (qdrantRuntimeState.collectionNames.includes(collectionName)) {
    return true;
  }

  if (!isQdrantAutoInitEnabled()) {
    return false;
  }

  try {
    await qdrantRequest(`/collections/${collectionName}`, {
      method: "PUT",
      bodyJson: {
        vectors: {
          size: dimension,
          distance: "Cosine",
        },
      },
    });
    await ensureQdrantPayloadIndex(collectionName, "workspaceId");
    await ensureQdrantPayloadIndex(collectionName, "pageId");

    if (!qdrantRuntimeState.collectionNames.includes(collectionName)) {
      qdrantRuntimeState.collectionNames = [...qdrantRuntimeState.collectionNames, collectionName];
    }
    updateQdrantRuntimeState({
      ready: true,
      collectionNames: qdrantRuntimeState.collectionNames,
    });
    return true;
  } catch (error) {
    updateQdrantRuntimeState({
      ready: false,
      error,
      collectionNames: qdrantRuntimeState.collectionNames,
    });
    logError("vector.qdrant.collection_init_failed", error, {
      collectionName,
      dimension,
    });
    return false;
  }
}

async function syncPgvectorRows(input: {
  workspaceId: string;
  pageId: string;
  chunks: PageEmbeddingChunkInput[];
}) {
  const ready = await ensurePgvectorReady();
  if (!ready) {
    return;
  }

  try {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM page_embedding_vector_chunks WHERE page_id = ${input.pageId}`
    );

    if (input.chunks.length === 0) {
      return;
    }

    const values = input.chunks.map((chunk) =>
      Prisma.sql`(
        ${input.workspaceId},
        ${input.pageId},
        ${chunk.chunkIndex},
        CAST(${toVectorLiteral(chunk.embedding)} AS vector),
        NOW(),
        NOW()
      )`
    );

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO page_embedding_vector_chunks (
        workspace_id,
        page_id,
        chunk_index,
        embedding,
        created_at,
        updated_at
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (page_id, chunk_index)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `);
  } catch (error) {
    logError("vector.pgvector.sync_failed", error, {
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      chunkCount: input.chunks.length,
    });
  }
}

async function syncQdrantRows(input: {
  workspaceId: string;
  pageId: string;
  chunks: PageEmbeddingChunkInput[];
}) {
  if (getVectorStoreBackend() !== "qdrant" || input.chunks.length === 0) {
    return;
  }

  const chunksByDimension = new Map<number, PageEmbeddingChunkInput[]>();
  for (const chunk of input.chunks) {
    const dimension = chunk.embedding.length;
    if (!chunksByDimension.has(dimension)) {
      chunksByDimension.set(dimension, []);
    }
    chunksByDimension.get(dimension)?.push(chunk);
  }

  for (const [dimension, chunks] of chunksByDimension.entries()) {
    const collectionName = qdrantCollectionNameForDimension(dimension);
    const ready = await ensureQdrantCollection(collectionName, dimension);
    if (!ready) {
      continue;
    }

    try {
      await qdrantRequest(`/collections/${collectionName}/points?wait=true`, {
        method: "PUT",
        bodyJson: {
          points: chunks.map((chunk) => ({
            id: qdrantPointId(input.pageId, chunk.chunkIndex),
            vector: chunk.embedding,
            payload: {
              workspaceId: input.workspaceId,
              pageId: input.pageId,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentHash: chunk.contentHash,
            },
          })),
        },
      });
    } catch (error) {
      logError("vector.qdrant.sync_failed", error, {
        workspaceId: input.workspaceId,
        pageId: input.pageId,
        chunkCount: chunks.length,
        collectionName,
      });
    }
  }
}

async function deletePgvectorRows(pageIds: string[]) {
  const ready = await ensurePgvectorReady();
  if (!ready || pageIds.length === 0) {
    return;
  }

  try {
    await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM page_embedding_vector_chunks
        WHERE page_id IN (${Prisma.join(pageIds.map((pageId) => Prisma.sql`${pageId}`))})
      `
    );
  } catch (error) {
    logError("vector.pgvector.delete_failed", error, {
      pageCount: pageIds.length,
    });
  }
}

async function deleteQdrantRows(pageIds: string[]) {
  if (getVectorStoreBackend() !== "qdrant" || pageIds.length === 0) {
    return;
  }

  const ready = await ensureQdrantReady();
  if (!ready) {
    return;
  }

  for (const collectionName of qdrantRuntimeState.collectionNames) {
    try {
      await qdrantRequest(`/collections/${collectionName}/points/delete?wait=true`, {
        method: "POST",
        bodyJson: {
          filter: {
            must: [
              {
                key: "pageId",
                match: {
                  any: pageIds,
                },
              },
            ],
          },
        },
      });
    } catch (error) {
      logError("vector.qdrant.delete_failed", error, {
        pageCount: pageIds.length,
        collectionName,
      });
    }
  }
}

async function queryJsonStore(input: {
  workspaceId: string;
  pageIds: string[];
  queryEmbedding: number[];
  limit: number;
  candidateLimit: number;
}) {
  const chunks = await prisma.pageEmbeddingChunk.findMany({
    where: {
      workspaceId: input.workspaceId,
      pageId: { in: input.pageIds },
    },
    select: {
      pageId: true,
      title: true,
      content: true,
      embedding: true,
      page: {
        select: {
          title: true,
          slug: true,
          icon: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: input.candidateLimit,
  });

  return chunks
    .map((chunk) => {
      const embedding = toNumberArray(chunk.embedding);
      return {
        pageId: chunk.pageId,
        title: chunk.page.title,
        slug: chunk.page.slug,
        icon: chunk.page.icon,
        content: chunk.content,
        score: cosineSimilarity(input.queryEmbedding, embedding),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit);
}

async function queryPgvectorStore(input: {
  workspaceId: string;
  pageIds: string[];
  queryEmbedding: number[];
  limit: number;
}) {
  const ready = await ensurePgvectorReady();
  if (!ready || input.pageIds.length === 0) {
    return [];
  }

  try {
    return prisma.$queryRaw<VectorSearchMatch[]>(Prisma.sql`
      SELECT
        pec."pageId" AS "pageId",
        p.title AS title,
        p.slug AS slug,
        p.icon AS icon,
        pec.content AS content,
        1 - (vec.embedding <=> CAST(${toVectorLiteral(input.queryEmbedding)} AS vector)) AS score
      FROM page_embedding_vector_chunks vec
      JOIN "PageEmbeddingChunk" pec
        ON pec."pageId" = vec.page_id
       AND pec."chunkIndex" = vec.chunk_index
      JOIN "Page" p
        ON p.id = pec."pageId"
      WHERE vec.workspace_id = ${input.workspaceId}
        AND vec.page_id IN (${Prisma.join(input.pageIds.map((pageId) => Prisma.sql`${pageId}`))})
      ORDER BY vec.embedding <=> CAST(${toVectorLiteral(input.queryEmbedding)} AS vector) ASC
      LIMIT ${input.limit}
    `);
  } catch (error) {
    logError("vector.pgvector.query_failed", error, {
      workspaceId: input.workspaceId,
      pageCount: input.pageIds.length,
      limit: input.limit,
    });
    return [];
  }
}

async function queryQdrantStore(input: {
  workspaceId: string;
  pageIds: string[];
  queryEmbedding: number[];
  limit: number;
}) {
  const ready = await ensureQdrantReady();
  if (!ready || input.pageIds.length === 0) {
    return [];
  }

  const collectionName = qdrantCollectionNameForDimension(input.queryEmbedding.length);
  if (!qdrantRuntimeState.collectionNames.includes(collectionName)) {
    return [];
  }

  try {
    const response = await qdrantRequest<QdrantSearchResponse>(
      `/collections/${collectionName}/points/search`,
      {
        method: "POST",
        bodyJson: {
          vector: input.queryEmbedding,
          limit: input.limit,
          with_payload: true,
          filter: {
            must: [
              {
                key: "workspaceId",
                match: {
                  value: input.workspaceId,
                },
              },
              {
                key: "pageId",
                match: {
                  any: input.pageIds,
                },
              },
            ],
          },
        },
      }
    );

    const matches = Array.isArray(response.result)
      ? response.result
      : Array.isArray(response.result?.points)
        ? response.result.points
        : [];

    if (matches.length === 0) {
      return [];
    }

    const pageIds = Array.from(
      new Set(
        matches
          .map((match) => match.payload?.pageId)
          .filter((value): value is string => typeof value === "string")
      )
    );
    const pages = await prisma.page.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true,
        title: true,
        slug: true,
        icon: true,
      },
    });
    const pageMap = new Map(pages.map((page) => [page.id, page]));

    return matches
      .map((match) => {
        const pageId =
          match.payload && typeof match.payload.pageId === "string"
            ? match.payload.pageId
            : null;
        if (!pageId) return null;
        const page = pageMap.get(pageId);
        if (!page) return null;

        return {
          pageId,
          title: page.title,
          slug: page.slug,
          icon: page.icon,
          content:
            match.payload && typeof match.payload.content === "string"
              ? match.payload.content
              : "",
          score: typeof match.score === "number" ? match.score : 0,
        };
      })
      .filter((value): value is VectorSearchMatch => Boolean(value));
  } catch (error) {
    logError("vector.qdrant.query_failed", error, {
      workspaceId: input.workspaceId,
      pageCount: input.pageIds.length,
      limit: input.limit,
      dimension: input.queryEmbedding.length,
    });
    return [];
  }
}

async function countPgvectorChunks(workspaceId?: string) {
  const ready = await ensurePgvectorReady();
  if (!ready) {
    return null;
  }

  try {
    const where =
      workspaceId === undefined
        ? Prisma.empty
        : Prisma.sql`WHERE workspace_id = ${workspaceId}`;
    const result = await prisma.$queryRaw<Array<{ count: bigint | number | string }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM page_embedding_vector_chunks
      ${where}
    `);
    return normalizeCountValue(result[0]?.count);
  } catch (error) {
    logError("vector.pgvector.count_failed", error, {
      workspaceId: workspaceId || null,
    });
    return null;
  }
}

async function countQdrantChunks(workspaceId?: string) {
  const ready = await ensureQdrantReady();
  if (!ready) {
    return null;
  }

  const collectionNames = qdrantRuntimeState.collectionNames;
  if (collectionNames.length === 0) {
    return 0;
  }

  try {
    const counts = await Promise.all(
      collectionNames.map(async (collectionName) => {
        const response = await qdrantRequest<QdrantCountResponse>(
          `/collections/${collectionName}/points/count`,
          {
            method: "POST",
            bodyJson: workspaceId
              ? {
                  exact: true,
                  filter: {
                    must: [
                      {
                        key: "workspaceId",
                        match: {
                          value: workspaceId,
                        },
                      },
                    ],
                  },
                }
              : { exact: true },
          }
        );
        return normalizeCountValue(response.result?.count);
      })
    );

    return counts.reduce((total, count) => total + count, 0);
  } catch (error) {
    logError("vector.qdrant.count_failed", error, {
      workspaceId: workspaceId || null,
    });
    return null;
  }
}

export async function getVectorStoreRuntimeStatus(input?: {
  workspaceId?: string;
  forceCheck?: boolean;
}): Promise<VectorStoreRuntimeStatus> {
  const configuredBackend = getVectorStoreBackend();
  const [pgvectorReady, qdrantReady] = await Promise.all([
    configuredBackend === "pgvector"
      ? ensurePgvectorReady({ force: input?.forceCheck })
      : Promise.resolve(false),
    configuredBackend === "qdrant"
      ? ensureQdrantReady({ force: input?.forceCheck })
      : Promise.resolve(false),
  ]);

  const effectiveReadBackend =
    configuredBackend === "pgvector" && pgvectorReady
      ? "pgvector"
      : configuredBackend === "qdrant" && qdrantReady
        ? "qdrant"
        : "json";

  const countVectorChunks =
    effectiveReadBackend === "pgvector"
      ? countPgvectorChunks
      : effectiveReadBackend === "qdrant"
        ? countQdrantChunks
        : async () => null;

  const [jsonChunkCount, workspaceJsonChunkCount, vectorChunkCount, workspaceVectorChunkCount] =
    await Promise.all([
      prisma.pageEmbeddingChunk.count(),
      input?.workspaceId
        ? prisma.pageEmbeddingChunk.count({
            where: { workspaceId: input.workspaceId },
          })
        : Promise.resolve(0),
      countVectorChunks(),
      input?.workspaceId ? countVectorChunks(input.workspaceId) : Promise.resolve(null),
    ]);

  return {
    configuredBackend,
    effectiveReadBackend,
    fallbackActive: configuredBackend !== "json" && effectiveReadBackend === "json",
    helperTable: configuredBackend === "pgvector" ? PGVECTOR_TABLE : null,
    pgvector: {
      ready: pgvectorReady,
      checkedAt: pgvectorRuntimeState.checkedAt,
      lastError: pgvectorRuntimeState.lastError,
      lastErrorCode: pgvectorRuntimeState.lastErrorCode,
      autoInitEnabled: isPgvectorAutoInitEnabled(),
    },
    qdrant: {
      ready: qdrantReady,
      checkedAt: qdrantRuntimeState.checkedAt,
      lastError: qdrantRuntimeState.lastError,
      lastErrorCode: qdrantRuntimeState.lastErrorCode,
      autoInitEnabled: isQdrantAutoInitEnabled(),
      collectionPrefix: getQdrantCollectionPrefix(),
      collectionCount: qdrantRuntimeState.collectionNames.length,
      collectionNames: qdrantRuntimeState.collectionNames,
    },
    counts: {
      jsonChunkCount,
      vectorChunkCount,
    },
    workspaceCounts: input?.workspaceId
      ? {
          workspaceId: input.workspaceId,
          jsonChunkCount: workspaceJsonChunkCount,
          vectorChunkCount: workspaceVectorChunkCount,
        }
      : null,
  };
}

export async function replacePageEmbeddings(input: {
  workspaceId: string;
  pageId: string;
  provider: string;
  model: string;
  chunks: PageEmbeddingChunkInput[];
}) {
  await prisma.$transaction(async (tx) => {
    await tx.pageEmbeddingChunk.deleteMany({
      where: { pageId: input.pageId },
    });
    await tx.pageEmbeddingChunk.createMany({
      data: input.chunks.map((chunk) => ({
        pageId: input.pageId,
        workspaceId: input.workspaceId,
        chunkIndex: chunk.chunkIndex,
        title: chunk.title,
        content: chunk.content,
        contentHash: chunk.contentHash,
        embedding: chunk.embedding as Prisma.InputJsonValue,
        dimension: chunk.embedding.length,
        provider: input.provider,
        model: input.model,
      })),
    });
  });

  await deleteQdrantRows([input.pageId]);
  await Promise.all([
    syncPgvectorRows({
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      chunks: input.chunks,
    }),
    syncQdrantRows({
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      chunks: input.chunks,
    }),
  ]);
}

export async function deletePageEmbeddings(pageIds: string[]) {
  if (pageIds.length === 0) {
    return;
  }

  await prisma.pageEmbeddingChunk.deleteMany({
    where: { pageId: { in: pageIds } },
  });
  await Promise.all([deletePgvectorRows(pageIds), deleteQdrantRows(pageIds)]);
}

export async function searchSimilarEmbeddings(input: {
  workspaceId: string;
  pageIds: string[];
  queryEmbedding: number[];
  limit: number;
  candidateLimit: number;
}) {
  if (input.pageIds.length === 0) {
    return [];
  }

  const backend = getVectorStoreBackend();

  if (backend === "pgvector") {
    const pgvectorResults = await queryPgvectorStore(input);
    if (pgvectorResults.length > 0) {
      return pgvectorResults;
    }
  }

  if (backend === "qdrant") {
    const qdrantResults = await queryQdrantStore(input);
    if (qdrantResults.length > 0) {
      return qdrantResults;
    }
  }

  return queryJsonStore(input);
}
