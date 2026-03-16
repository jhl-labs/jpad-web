import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

const LOCK_TTL_MS = 10_000; // 10 seconds max hold time
const RETRY_DELAY_MS = 50;
const MAX_RETRIES = 100; // 5 seconds total wait

// In-process queue for local deduplication (avoids hammering Redis)
const localQueues = new Map<string, Promise<unknown>>();

async function acquireRedisLock(
  lockKey: string,
  token: string
): Promise<boolean> {
  const result = await redis.set(lockKey, token, "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function releaseRedisLock(
  lockKey: string,
  token: string
): Promise<void> {
  // Lua script for atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, lockKey, token);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Local queue: serialize same-key calls within this process
  while (localQueues.has(key)) {
    await localQueues.get(key);
  }

  const lockKey = `lock:git:${key}`;
  const token = randomUUID();

  let acquired = false;
  for (let i = 0; i < MAX_RETRIES; i++) {
    acquired = await acquireRedisLock(lockKey, token);
    if (acquired) break;
    await sleep(RETRY_DELAY_MS);
  }

  if (!acquired) {
    throw new Error(`Failed to acquire lock for ${key} after ${MAX_RETRIES} retries`);
  }

  const execution = (async () => {
    try {
      return await fn();
    } finally {
      await releaseRedisLock(lockKey, token).catch((err) => {
        console.error("Redis lock release error:", err);
      });
    }
  })();

  localQueues.set(key, execution.catch(() => {}));
  try {
    return await execution;
  } finally {
    localQueues.delete(key);
  }
}
