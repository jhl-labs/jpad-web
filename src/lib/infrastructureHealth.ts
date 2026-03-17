import net from "node:net";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logError } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComponentHealth {
  status: "healthy" | "unhealthy" | "disabled";
  latencyMs: number | null;
  version: string | null;
  error: string | null;
  config: Record<string, string | number | boolean>;
}

export interface InfrastructureHealthResult {
  postgres: ComponentHealth;
  redis: ComponentHealth;
  minio: ComponentHealth;
  clamav: ComponentHealth;
  qdrant: ComponentHealth;
  keycloak: ComponentHealth;
  checkedAt: string;
}

export interface StorageStats {
  postgres: {
    databaseSize: string | null;
    connectionCount: number | null;
  };
  redis: {
    usedMemory: string | null;
    usedMemoryHuman: string | null;
    totalKeys: number | null;
  };
  minio: {
    enabled: boolean;
    bucket: string | null;
  };
  qdrant: {
    enabled: boolean;
    collectionCount: number | null;
    totalPoints: number | null;
  };
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

function sanitizeUrl(url: string | undefined): string {
  if (!url) return "(not configured)";
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    if (parsed.username) {
      parsed.username = "***";
    }
    return parsed.toString();
  } catch {
    return "(invalid URL)";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} health check timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = performance.now();
  return fn().then((result) => ({
    result,
    latencyMs: Math.round(performance.now() - start),
  }));
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

async function checkPostgres(): Promise<ComponentHealth> {
  try {
    const { result, latencyMs } = await measureLatency(() =>
      withTimeout(
        prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`,
        HEALTH_CHECK_TIMEOUT_MS,
        "PostgreSQL",
      ),
    );

    const version = result[0]?.version ?? null;
    const shortVersion = version ? version.split(",")[0] ?? version : null;

    return {
      status: "healthy",
      latencyMs,
      version: shortVersion,
      error: null,
      config: {
        poolSize: parseInt(process.env.DATABASE_POOL_SIZE || "10", 10),
        url: sanitizeUrl(process.env.DATABASE_URL),
      },
    };
  } catch (err) {
    logError("infra.health.postgres", err);
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: err instanceof Error ? err.message : "Unknown PostgreSQL error",
      config: {
        url: sanitizeUrl(process.env.DATABASE_URL),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

async function checkRedis(): Promise<ComponentHealth> {
  try {
    const { result: pong, latencyMs } = await measureLatency(() =>
      withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT_MS, "Redis"),
    );

    if (pong !== "PONG") {
      return {
        status: "unhealthy",
        latencyMs,
        version: null,
        error: `Unexpected ping response: ${pong}`,
        config: { url: sanitizeUrl(process.env.REDIS_URL) },
      };
    }

    let version: string | null = null;
    try {
      const info = await redis.info("server");
      const match = info.match(/redis_version:(\S+)/);
      if (match) {
        version = match[1];
      }
    } catch {
      // version is optional
    }

    return {
      status: "healthy",
      latencyMs,
      version,
      error: null,
      config: { url: sanitizeUrl(process.env.REDIS_URL) },
    };
  } catch (err) {
    logError("infra.health.redis", err);
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: err instanceof Error ? err.message : "Unknown Redis error",
      config: { url: sanitizeUrl(process.env.REDIS_URL) },
    };
  }
}

// ---------------------------------------------------------------------------
// MinIO / S3
// ---------------------------------------------------------------------------

async function checkMinio(): Promise<ComponentHealth> {
  const storageType = process.env.STORAGE_TYPE || "local";
  if (storageType !== "s3") {
    return {
      status: "disabled",
      latencyMs: null,
      version: null,
      error: null,
      config: { storageType, reason: "STORAGE_TYPE is not s3" },
    };
  }

  try {
    const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      },
      forcePathStyle: true,
    });

    const bucket = process.env.S3_BUCKET || "jpad-uploads";

    const { latencyMs } = await measureLatency(() =>
      withTimeout(
        client.send(new HeadBucketCommand({ Bucket: bucket })),
        HEALTH_CHECK_TIMEOUT_MS,
        "MinIO/S3",
      ),
    );

    return {
      status: "healthy",
      latencyMs,
      version: null,
      error: null,
      config: {
        endpoint: sanitizeUrl(process.env.S3_ENDPOINT),
        bucket,
        region: process.env.S3_REGION || "us-east-1",
      },
    };
  } catch (err) {
    logError("infra.health.minio", err);
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: err instanceof Error ? err.message : "Unknown MinIO/S3 error",
      config: {
        endpoint: sanitizeUrl(process.env.S3_ENDPOINT),
        bucket: process.env.S3_BUCKET || "jpad-uploads",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// ClamAV
// ---------------------------------------------------------------------------

function clamavTcpCommand(host: string, port: number, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (error: Error | null, result?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(result || "");
      }
    };

    socket.setTimeout(HEALTH_CHECK_TIMEOUT_MS, () => {
      finish(new Error("ClamAV connection timed out"));
    });

    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    socket.on("end", () => {
      const response = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
      finish(null, response);
    });
    socket.on("connect", () => {
      socket.write(`${command}\0`);
    });
  });
}

async function checkClamav(): Promise<ComponentHealth> {
  const scanMode = (process.env.UPLOAD_MALWARE_SCAN_MODE || "off").trim().toLowerCase();
  const clamavHost = process.env.UPLOAD_CLAMAV_HOST?.trim() || null;

  if (scanMode === "off" && !clamavHost) {
    return {
      status: "disabled",
      latencyMs: null,
      version: null,
      error: null,
      config: { scanMode, reason: "Malware scan is off and no ClamAV host configured" },
    };
  }

  if (!clamavHost) {
    return {
      status: "disabled",
      latencyMs: null,
      version: null,
      error: null,
      config: { scanMode, reason: "UPLOAD_CLAMAV_HOST is not configured" },
    };
  }

  const port = parseInt(process.env.UPLOAD_CLAMAV_PORT || "3310", 10);

  try {
    const { latencyMs } = await measureLatency(async () => {
      const response = await withTimeout(
        clamavTcpCommand(clamavHost, port, "zPING"),
        HEALTH_CHECK_TIMEOUT_MS,
        "ClamAV",
      );
      if (!response.includes("PONG")) {
        throw new Error(`Unexpected ClamAV ping response: ${response}`);
      }
      return response;
    });

    let version: string | null = null;
    try {
      const versionResponse = await clamavTcpCommand(clamavHost, port, "zVERSION");
      version = versionResponse.split("/")[0]?.trim() || versionResponse;
    } catch {
      // version is optional
    }

    return {
      status: "healthy",
      latencyMs,
      version,
      error: null,
      config: {
        host: clamavHost,
        port,
        scanMode,
      },
    };
  } catch (err) {
    logError("infra.health.clamav", err);
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: err instanceof Error ? err.message : "Unknown ClamAV error",
      config: {
        host: clamavHost,
        port,
        scanMode,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Qdrant
// ---------------------------------------------------------------------------

async function checkQdrant(): Promise<ComponentHealth> {
  const backend = process.env.VECTOR_STORE_BACKEND || "json";
  const qdrantUrl = process.env.QDRANT_URL?.trim() || null;

  if (backend !== "qdrant" || !qdrantUrl) {
    return {
      status: "disabled",
      latencyMs: null,
      version: null,
      error: null,
      config: {
        backend,
        reason: backend !== "qdrant" ? "VECTOR_STORE_BACKEND is not qdrant" : "QDRANT_URL is not configured",
      },
    };
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.QDRANT_API_KEY?.trim();
    if (apiKey) {
      headers["api-key"] = apiKey;
    }

    const { result: response, latencyMs } = await measureLatency(() =>
      withTimeout(
        fetch(`${qdrantUrl.replace(/\/+$/, "")}/`, {
          headers,
          cache: "no-store",
        }),
        HEALTH_CHECK_TIMEOUT_MS,
        "Qdrant",
      ),
    );

    if (!response.ok) {
      throw new Error(`Qdrant returned status ${response.status}`);
    }

    let version: string | null = null;
    try {
      const body = (await response.json()) as { version?: string; title?: string };
      version = body.version ?? null;
    } catch {
      // version is optional
    }

    return {
      status: "healthy",
      latencyMs,
      version,
      error: null,
      config: {
        url: sanitizeUrl(qdrantUrl),
        collectionPrefix: process.env.QDRANT_COLLECTION_PREFIX || "jpad_page_embeddings",
      },
    };
  } catch (err) {
    logError("infra.health.qdrant", err);
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: err instanceof Error ? err.message : "Unknown Qdrant error",
      config: { url: sanitizeUrl(qdrantUrl) },
    };
  }
}

// ---------------------------------------------------------------------------
// Keycloak
// ---------------------------------------------------------------------------

async function checkKeycloak(): Promise<ComponentHealth> {
  const oidcEnabled = process.env.OIDC_ENABLED === "1";
  const issuer = process.env.OIDC_ISSUER?.trim() || null;

  if (!oidcEnabled || !issuer) {
    return {
      status: "disabled",
      latencyMs: null,
      version: null,
      error: null,
      config: {
        oidcEnabled,
        reason: !oidcEnabled ? "OIDC_ENABLED is not 1" : "OIDC_ISSUER is not configured",
      },
    };
  }

  try {
    const wellKnownUrl = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

    const { result: response, latencyMs } = await measureLatency(() =>
      withTimeout(
        fetch(wellKnownUrl, { cache: "no-store" }),
        HEALTH_CHECK_TIMEOUT_MS,
        "Keycloak",
      ),
    );

    if (!response.ok) {
      throw new Error(`Keycloak OIDC discovery returned status ${response.status}`);
    }

    const body = (await response.json()) as { issuer?: string };

    return {
      status: "healthy",
      latencyMs,
      version: null,
      error: null,
      config: {
        issuer: sanitizeUrl(issuer),
        discoveredIssuer: body.issuer ? sanitizeUrl(body.issuer) : "(missing)",
      },
    };
  } catch (err) {
    logError("infra.health.keycloak", err);
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: err instanceof Error ? err.message : "Unknown Keycloak error",
      config: { issuer: sanitizeUrl(issuer) },
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkAllHealth(): Promise<InfrastructureHealthResult> {
  const [postgres, redisResult, minio, clamav, qdrant, keycloak] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
    checkMinio(),
    checkClamav(),
    checkQdrant(),
    checkKeycloak(),
  ]);

  const toHealth = (result: PromiseSettledResult<ComponentHealth>): ComponentHealth => {
    if (result.status === "fulfilled") return result.value;
    return {
      status: "unhealthy",
      latencyMs: null,
      version: null,
      error: result.reason instanceof Error ? result.reason.message : "Check failed unexpectedly",
      config: {},
    };
  };

  return {
    postgres: toHealth(postgres),
    redis: toHealth(redisResult),
    minio: toHealth(minio),
    clamav: toHealth(clamav),
    qdrant: toHealth(qdrant),
    keycloak: toHealth(keycloak),
    checkedAt: new Date().toISOString(),
  };
}

export async function getStorageStats(): Promise<StorageStats> {
  // PostgreSQL stats
  let pgSize: string | null = null;
  let pgConnections: number | null = null;
  try {
    const sizeResult = await prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size
    `;
    pgSize = sizeResult[0]?.size ?? null;

    const connResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database()
    `;
    pgConnections = Number(connResult[0]?.count ?? 0);
  } catch (err) {
    logError("infra.storage.postgres", err);
  }

  // Redis stats
  let redisUsedMemory: string | null = null;
  let redisUsedMemoryHuman: string | null = null;
  let redisTotalKeys: number | null = null;
  try {
    const memInfo = await redis.info("memory");
    const memMatch = memInfo.match(/used_memory:(\d+)/);
    const memHumanMatch = memInfo.match(/used_memory_human:(\S+)/);
    redisUsedMemory = memMatch ? memMatch[1] : null;
    redisUsedMemoryHuman = memHumanMatch ? memHumanMatch[1] : null;

    const keyspaceInfo = await redis.info("keyspace");
    const keyMatch = keyspaceInfo.match(/keys=(\d+)/);
    redisTotalKeys = keyMatch ? parseInt(keyMatch[1], 10) : 0;
  } catch (err) {
    logError("infra.storage.redis", err);
  }

  // MinIO stats
  const minioEnabled = (process.env.STORAGE_TYPE || "local") === "s3";

  // Qdrant stats
  const qdrantEnabled = process.env.VECTOR_STORE_BACKEND === "qdrant";
  let qdrantCollectionCount: number | null = null;
  let qdrantTotalPoints: number | null = null;

  if (qdrantEnabled) {
    const qdrantUrl = process.env.QDRANT_URL?.trim();
    if (qdrantUrl) {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const apiKey = process.env.QDRANT_API_KEY?.trim();
        if (apiKey) {
          headers["api-key"] = apiKey;
        }

        const baseUrl = qdrantUrl.replace(/\/+$/, "");
        const collectionsRes = await fetch(`${baseUrl}/collections`, {
          headers,
          cache: "no-store",
        });

        if (collectionsRes.ok) {
          const collectionsBody = (await collectionsRes.json()) as {
            result?: { collections?: Array<{ name?: string }> };
          };
          const collections = collectionsBody.result?.collections ?? [];
          const prefix = process.env.QDRANT_COLLECTION_PREFIX || "jpad_page_embeddings";
          const matchingCollections = collections.filter(
            (c) => typeof c.name === "string" && c.name.startsWith(prefix),
          );
          qdrantCollectionCount = matchingCollections.length;

          let totalPoints = 0;
          for (const col of matchingCollections) {
            if (!col.name) continue;
            try {
              const countRes = await fetch(`${baseUrl}/collections/${col.name}/points/count`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({ exact: true }),
                cache: "no-store",
              });
              if (countRes.ok) {
                const countBody = (await countRes.json()) as { result?: { count?: number } };
                totalPoints += countBody.result?.count ?? 0;
              }
            } catch {
              // skip individual collection errors
            }
          }
          qdrantTotalPoints = totalPoints;
        }
      } catch (err) {
        logError("infra.storage.qdrant", err);
      }
    }
  }

  return {
    postgres: {
      databaseSize: pgSize,
      connectionCount: pgConnections,
    },
    redis: {
      usedMemory: redisUsedMemory,
      usedMemoryHuman: redisUsedMemoryHuman,
      totalKeys: redisTotalKeys,
    },
    minio: {
      enabled: minioEnabled,
      bucket: minioEnabled ? (process.env.S3_BUCKET || "jpad-uploads") : null,
    },
    qdrant: {
      enabled: qdrantEnabled,
      collectionCount: qdrantCollectionCount,
      totalPoints: qdrantTotalPoints,
    },
    checkedAt: new Date().toISOString(),
  };
}
