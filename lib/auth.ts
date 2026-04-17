/**
 * API Key Authentication — Lab 12 compliant
 *
 * Client gửi header `X-API-Key: <key>` cho mọi request vào endpoint bảo vệ.
 * Nếu không có hoặc sai → 401.
 *
 * Rotate key: đổi env `AGENT_API_KEY` + restart container.
 */

const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false";

export type AuthResult =
  | { ok: true; keyId: string }
  | { ok: false; status: 401; error: string };

export function verifyApiKey(req: Request): AuthResult {
  if (!REQUIRE_AUTH) {
    return { ok: true, keyId: "anonymous" };
  }

  if (!AGENT_API_KEY) {
    return {
      ok: false,
      status: 401,
      error:
        "Server missing AGENT_API_KEY env var. Set it in production or REQUIRE_AUTH=false for dev.",
    };
  }

  const provided = req.headers.get("x-api-key") || "";
  if (!provided) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Include header: X-API-Key: <key>",
    };
  }

  if (provided !== AGENT_API_KEY) {
    return { ok: false, status: 401, error: "Invalid API key." };
  }

  // Use first 8 chars as stable key identifier for rate-limit bucket
  return { ok: true, keyId: provided.slice(0, 8) };
}

export function authErrorResponse(result: Extract<AuthResult, { ok: false }>) {
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
