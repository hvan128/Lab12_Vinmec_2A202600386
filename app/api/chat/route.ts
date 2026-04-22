import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { tools } from "@/lib/agent/tools";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { AGENT_CONFIG } from "@/lib/agent/config";
import { scoreAsync } from "@/lib/agent/judge";
import { verifyApiKey, authErrorResponse } from "@/lib/auth";
import { checkRateLimit, rateLimitErrorResponse } from "@/lib/rateLimit";
import {
  checkBudget,
  recordUsage,
  budgetErrorResponse,
  estimateRequestInputTokens,
  estimateOutputTokens,
} from "@/lib/costGuard";
import { tracer, calcLLMCost, SpanStatusCode } from "@/lib/tracing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Normalize messages: accept both AI SDK v6 UIMessage (parts[]) format
 * and legacy simple format ({ role, content }) from test scripts.
 */
function normalizeMessages(raw: unknown[]): Omit<UIMessage, "id">[] {
  return raw.map((msg) => {
    if (typeof msg !== "object" || msg === null) {
      throw new Error("Message không hợp lệ");
    }
    const m = msg as Record<string, unknown>;
    const role = m.role as "user" | "assistant" | "system";

    // Already in UIMessage parts format
    if (Array.isArray(m.parts)) {
      return { role, parts: m.parts as UIMessage["parts"] };
    }

    // Legacy { role, content: string } format
    if (typeof m.content === "string") {
      return {
        role,
        parts: [{ type: "text" as const, text: m.content }],
      };
    }

    // content is array (openai message format)
    if (Array.isArray(m.content)) {
      const textContent = (m.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      return {
        role,
        parts: [{ type: "text" as const, text: textContent }],
      };
    }

    return { role, parts: [] };
  });
}

export async function POST(req: Request) {
  // ── Lab 12: Auth + Rate limit ────────────────────────────
  const auth = verifyApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);

  const rl = checkRateLimit(auth.keyId);
  if (!rl.ok) return rateLimitErrorResponse(rl);

  // Parse body before budget check (need messages for token estimation)
  let body: { messages?: unknown[]; userId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body không hợp lệ" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, userId } = body;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Thiếu userId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages phải là array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Inject ngày hiện tại VN (UTC+7) để agent biết hôm nay là ngày mấy
  const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
  const todayVN = nowVN.toISOString().slice(0, 10); // YYYY-MM-DD

  // Load base prompt + golden examples (cached 60s)
  const basePrompt = await getSystemPrompt();
  const systemWithUser = `${basePrompt}\n\nNgày hôm nay (giờ Việt Nam): ${todayVN}\nUSER_ID hiện tại: ${userId}`;

  const normalized = normalizeMessages(messages);
  const modelMessages = await convertToModelMessages(normalized);

  // Extract last user message for judge scoring
  const lastUserMsg = [...messages]
    .reverse()
    .find((m): m is Record<string, unknown> => {
      return typeof m === "object" && m !== null && (m as Record<string, unknown>).role === "user";
    });
  const userQuery =
    typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.parts)
      ? (lastUserMsg.parts as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("")
      : "";

  // ── Cost guard (accurate estimate from actual content) ──
  const messagesContentLength = messages
    .map((m) => {
      const msg = m as Record<string, unknown>;
      if (typeof msg.content === "string") return msg.content.length;
      if (Array.isArray(msg.content)) {
        return (msg.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("").length;
      }
      return 0;
    })
    .reduce((sum, len) => sum + len, 0);

  const estInputTokens = estimateRequestInputTokens(
    systemWithUser.length,
    messagesContentLength,
  );
  const estOutputTokens = estimateOutputTokens(userQuery.length);

  const budgetCheck = checkBudget(auth.keyId, estInputTokens, estOutputTokens);
  if (!budgetCheck.ok) return budgetErrorResponse(budgetCheck);

  // ── LLM call with tracing span ───────────────────────────
  const llmSpan = tracer.startSpan("llm.agent", {
    attributes: {
      "llm.model": AGENT_CONFIG.model,
      "llm.est_input_tokens": estInputTokens,
      "llm.est_output_tokens": estOutputTokens,
      "llm.user_id": userId,
      "llm.messages_count": messages.length,
    },
  });

  const result = streamText({
    model: openai(AGENT_CONFIG.model),
    system: systemWithUser,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(AGENT_CONFIG.maxSteps),
    temperature: AGENT_CONFIG.temperature,
    onError: (e: unknown) => {
      llmSpan.recordException(e as Error);
      console.error("[chat] stream error:", e);
    },
  });

  // Fire-and-forget: judge scoring + cost guard usage recording after stream completes.
  Promise.all([result.text, result.toolCalls, result.usage])
    .then(([botText, calls, usage]) => {
      const toolNames = calls.map((c) => c.toolName);
      scoreAsync(userId, userQuery, botText, toolNames);

      if (usage && typeof usage === "object") {
        const u = usage as { inputTokens?: number; outputTokens?: number };
        const inputTokens = u.inputTokens ?? 0;
        const outputTokens = u.outputTokens ?? 0;
        const cost = calcLLMCost(inputTokens, outputTokens);

        llmSpan.setAttributes({
          "llm.input_tokens": inputTokens,
          "llm.output_tokens": outputTokens,
          "llm.total_tokens": inputTokens + outputTokens,
          "llm.cost_usd": cost,
          "llm.tools_called": calls.length,
        });

        recordUsage(auth.keyId, inputTokens, outputTokens);
      }

      llmSpan.setStatus({ code: SpanStatusCode.OK });
      llmSpan.end();
    })
    .catch((e) => {
      llmSpan.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      llmSpan.recordException(e as Error);
      llmSpan.end();
      console.error("[chat] post-stream error:", e);
    });

  return result.toUIMessageStreamResponse();
}
