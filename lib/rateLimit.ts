/**
 * Sliding Window Rate Limiter — Lab 12 compliant
 *
 * 10 requests / minute / key (configurable via RATE_LIMIT_PER_MINUTE).
 * Single-process in-memory store. Đủ cho single instance + load balancer sticky.
 * Nếu scale horizontal → thay bằng Redis (lib/db/client.ts đã có Postgres sẵn,
 * có thể upgrade sang Redis khi cần).
 */

import { tracer, SpanStatusCode } from "@/lib/tracing";

const WINDOW_MS = 60_000;
const LIMIT = parseInt(process.env.RATE_LIMIT_PER_MINUTE || "10", 10);

const buckets = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetIn: number }
  | { ok: false; status: 429; error: string; retryAfter: number };

export function checkRateLimit(key: string): RateLimitResult {
  return tracer.startActiveSpan(
    "ratelimit.check",
    {
      attributes: {
        "ratelimit.key": key,
        "ratelimit.limit": LIMIT,
        "ratelimit.window_ms": WINDOW_MS,
      },
    },
    (span) => {
      try {
        const now = Date.now();
        const arr = buckets.get(key) ?? [];

        // drop timestamps older than window
        while (arr.length && arr[0] < now - WINDOW_MS) arr.shift();

        const remaining = LIMIT - arr.length;
        span.setAttribute("ratelimit.remaining", remaining);

        if (arr.length >= LIMIT) {
          const retryAfter = Math.ceil((arr[0] + WINDOW_MS - now) / 1000);
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Rate limit exceeded" });
          span.end();
          return {
            ok: false as const,
            status: 429 as const,
            error: `Rate limit exceeded: ${LIMIT} req/min`,
            retryAfter,
          };
        }

        arr.push(now);
        buckets.set(key, arr);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return {
          ok: true as const,
          remaining,
          resetIn: Math.ceil(WINDOW_MS / 1000),
        };
      } catch (err) {
        const e = err as Error;
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
        span.recordException(e);
        span.end();
        throw err;
      }
    },
  );
}

export function rateLimitErrorResponse(
  result: Extract<RateLimitResult, { ok: false }>,
) {
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(result.retryAfter),
    },
  });
}

// Periodically clean empty buckets to avoid unbounded memory.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of buckets) {
      while (arr.length && arr[0] < now - WINDOW_MS) arr.shift();
      if (arr.length === 0) buckets.delete(k);
    }
  }, WINDOW_MS).unref?.();
}
