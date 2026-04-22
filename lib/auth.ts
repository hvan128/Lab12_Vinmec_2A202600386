/**
 * API Key Authentication — Lab 12 compliant
 *
 * Client gửi header `X-API-Key: <key>` cho mọi request vào endpoint bảo vệ.
 * Nếu không có hoặc sai → 401.
 *
 * Rotate key: đổi env `AGENT_API_KEY` + restart container.
 */

import { tracer, SpanStatusCode } from "@/lib/tracing";

const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false";

// Origins được phép dùng UI mà không cần X-API-Key (same-origin browser fetch).
// External API consumers vẫn bắt buộc gửi X-API-Key.
const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const ALLOWED_UI_ORIGINS = new Set(
  [PUBLIC_APP_URL, "http://localhost:3000", "http://localhost:3003"].filter(Boolean),
);

export type AuthResult =
  | { ok: true; keyId: string; source: "api-key" | "ui" | "anonymous" }
  | { ok: false; status: 401; error: string };

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export function verifyApiKey(req: Request): AuthResult {
  return tracer.startActiveSpan(
    "auth.verify_api_key",
    {
      attributes: {
        "auth.require_auth": REQUIRE_AUTH,
        "auth.has_origin": !!req.headers.get("origin"),
      },
    },
    (span) => {
      try {
        if (!REQUIRE_AUTH) {
          span.setAttributes({ "auth.result": "anonymous", "auth.key_id": "anonymous" });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return { ok: true as const, keyId: "anonymous", source: "anonymous" as const };
        }

        // Same-origin UI request → bypass API key, bucket rate-limit per client IP.
        const origin = req.headers.get("origin") || "";
        if (origin && ALLOWED_UI_ORIGINS.has(origin.replace(/\/$/, ""))) {
          const keyId = `ui-${clientIp(req).slice(0, 20)}`;
          span.setAttributes({ "auth.result": "ui", "auth.key_id": keyId });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return { ok: true as const, keyId, source: "ui" as const };
        }

        // External caller → must send X-API-Key.
        if (!AGENT_API_KEY) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Missing AGENT_API_KEY env" });
          span.end();
          return {
            ok: false as const,
            status: 401 as const,
            error:
              "Server missing AGENT_API_KEY env var. Set it in production or REQUIRE_AUTH=false for dev.",
          };
        }

        const provided = req.headers.get("x-api-key") || "";
        if (!provided) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Missing API key" });
          span.end();
          return {
            ok: false as const,
            status: 401 as const,
            error: "Missing API key. Include header: X-API-Key: <key>",
          };
        }

        if (provided !== AGENT_API_KEY) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Invalid API key" });
          span.end();
          return { ok: false as const, status: 401 as const, error: "Invalid API key." };
        }

        const keyId = provided.slice(0, 8);
        span.setAttributes({ "auth.result": "api-key", "auth.key_id": keyId });
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return { ok: true as const, keyId, source: "api-key" as const };
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

export function authErrorResponse(result: Extract<AuthResult, { ok: false }>) {
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
