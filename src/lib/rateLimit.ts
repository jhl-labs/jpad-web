import { redis } from "./redis";
import { logError } from "./logger";

const RATE_LIMIT_MAP_MAX_SIZE = 10000;
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function pruneRateLimitMap() {
  if (rateLimitMap.size <= RATE_LIMIT_MAP_MAX_SIZE) return;

  const now = Date.now();
  // 먼저 만료된 항목 삭제
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }

  // 그래도 초과하면 가장 오래된 항목부터 삭제 (Map은 삽입 순서 유지)
  if (rateLimitMap.size > RATE_LIMIT_MAP_MAX_SIZE) {
    const excess = rateLimitMap.size - RATE_LIMIT_MAP_MAX_SIZE;
    let deleted = 0;
    for (const key of rateLimitMap.keys()) {
      if (deleted >= excess) break;
      rateLimitMap.delete(key);
      deleted++;
    }
  }
}

type HeaderBag =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

function readHeader(headers: HeaderBag, name: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function extractClientIp(headers: HeaderBag): string {
  const forwardedFor = readHeader(headers, "x-forwarded-for");
  const realIp = readHeader(headers, "x-real-ip");

  if (forwardedFor) {
    const ips = forwardedFor.split(",").map(ip => ip.trim()).filter(Boolean);
    const proxyCount = parseInt(process.env.TRUSTED_PROXY_COUNT || "1", 10);
    // Take the IP at position length - proxyCount (the one added by the trusted proxy)
    const idx = Math.max(0, ips.length - proxyCount);
    return ips[idx] || "unknown";
  }

  return realIp?.trim() || "unknown";
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  // WARNING: DISABLE_RATE_LIMITS 환경변수는 개발/테스트 환경에서만 사용해야 합니다.
  // 프로덕션 환경에서는 절대 사용 금지 — DDoS 및 남용 공격에 노출될 수 있습니다.
  if (process.env.DISABLE_RATE_LIMITS === "1" && process.env.NODE_ENV !== "production") {
    return true;
  }

  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    pruneRateLimitMap();
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

export async function rateLimitRedis(key: string, limit: number, windowMs: number): Promise<boolean> {
  // WARNING: DISABLE_RATE_LIMITS 환경변수는 개발/테스트 환경에서만 사용해야 합니다.
  // 프로덕션 환경에서는 절대 사용 금지 — DDoS 및 남용 공격에 노출될 수 있습니다.
  if (process.env.DISABLE_RATE_LIMITS === "1" && process.env.NODE_ENV !== "production") {
    return true;
  }

  try {
    const redisKey = `ratelimit:${key}`;
    // INCR + PEXPIRE를 pipeline으로 원자적 처리
    const results = await redis
      .pipeline()
      .incr(redisKey)
      .pexpire(redisKey, windowMs)
      .exec();

    if (!results) {
      return rateLimit(key, limit, windowMs);
    }

    const [incrResult, pexpireResult] = results;
    const count = (incrResult?.[1] as number) ?? 0;

    // PEXPIRE 실패 시 키가 영구 존재하지 않도록 방어
    if (pexpireResult?.[0] || pexpireResult?.[1] === 0) {
      try {
        await redis.del(redisKey);
      } catch (delError) {
        logError("rateLimit.redis.del.best_effort_failed", delError);
      }
    }

    return count <= limit;
  } catch (redisError) {
    logError("rateLimit.redis.fallback_to_memory", redisError);
    return rateLimit(key, limit, windowMs);
  }
}
