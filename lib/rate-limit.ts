import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

let redis: Redis | undefined;
const limiters = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit {
  const key = `${limit}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    if (!redis) redis = Redis.fromEnv();
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${Math.round(windowMs / 1000)} s`),
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

// In-memory sliding-window fallback for dev/local single-instance environments.
// Not correct across serverless cold starts or multiple instances.
const hits = new Map<string, number[]>();

function inMemoryCheck(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (useUpstash) {
    const limiter = getUpstashLimiter(limit, windowMs);
    const { success } = await limiter.limit(key);
    return success;
  }
  return inMemoryCheck(key, limit, windowMs);
}
