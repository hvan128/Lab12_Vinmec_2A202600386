/**
 * Cost Guard — Lab 12 compliant
 *
 * Monthly budget guard. Default $10/month (configurable MONTHLY_BUDGET_USD).
 * Track per-key cost in memory (resets khi container restart — production nên
 * đổi sang persisted store như Postgres hoặc Redis).
 *
 * Pricing dùng cho gpt-4o-mini:
 *   input  $0.150 / 1M tokens  = $0.00015 / 1k
 *   output $0.600 / 1M tokens  = $0.00060 / 1k
 */

import { tracer, calcLLMCost, SpanStatusCode } from "@/lib/tracing";

const MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET_USD || "10");
const INPUT_PRICE_PER_1K = 0.00015;
const OUTPUT_PRICE_PER_1K = 0.0006;

type MonthBucket = { month: string; spentUsd: number };
const spend = new Map<string, MonthBucket>();

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export type BudgetResult =
  | { ok: true; spentUsd: number; remainingUsd: number }
  | { ok: false; status: 402; error: string };

/**
 * Estimate input tokens from raw text length.
 * Approximate ratio: ~3.5 chars/token for Vietnamese mixed with English/code.
 * Conservative (slightly overestimates to avoid surprise bills).
 */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate total input tokens for a chat request.
 * Includes: system prompt + golden examples + all messages + tool results.
 */
export function estimateRequestInputTokens(
  systemPromptLength: number,
  messagesLength: number,
  toolResultsLength = 300,
): number {
  const totalLength = systemPromptLength + messagesLength + toolResultsLength;
  return Math.ceil(totalLength / 3.5);
}

/**
 * Estimate output tokens based on query characteristics.
 * Longer questions, multi-step tasks → more output.
 */
export function estimateOutputTokens(queryLength: number): number {
  if (queryLength < 50) return 100;
  if (queryLength < 200) return 200;
  return 350;
}

export function checkBudget(
  key: string,
  estInputTokens: number,
  estOutputTokens: number,
): BudgetResult {
  return tracer.startActiveSpan(
    "budget.check",
    {
      attributes: {
        "budget.key": key,
        "budget.est_input_tokens": estInputTokens,
        "budget.est_output_tokens": estOutputTokens,
        "budget.monthly_limit_usd": MONTHLY_BUDGET,
      },
    },
    (span): BudgetResult => {
      try {
        const month = currentMonth();
        const bucket = spend.get(key);
        const current = bucket && bucket.month === month ? bucket.spentUsd : 0;
        const estCost =
          (estInputTokens / 1000) * INPUT_PRICE_PER_1K +
          (estOutputTokens / 1000) * OUTPUT_PRICE_PER_1K;

        span.setAttributes({
          "budget.current_spent_usd": current,
          "budget.est_cost_usd": estCost,
          "budget.remaining_usd": Math.max(0, MONTHLY_BUDGET - current - estCost),
        });

        if (current + estCost > MONTHLY_BUDGET) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Budget exceeded" });
          span.end();
          return {
            ok: false,
            status: 402 as const,
            error: `Monthly budget exceeded ($${MONTHLY_BUDGET}). Resets next month.`,
          } as BudgetResult;
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return {
          ok: true as const,
          spentUsd: current,
          remainingUsd: Math.max(0, MONTHLY_BUDGET - current),
        } as BudgetResult;
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

export function recordUsage(
  key: string,
  inputTokens: number,
  outputTokens: number,
) {
  return tracer.startActiveSpan(
    "budget.record_usage",
    {
      attributes: {
        "budget.key": key,
        "llm.input_tokens": inputTokens,
        "llm.output_tokens": outputTokens,
      },
    },
    (span) => {
      try {
        const cost = calcLLMCost(inputTokens, outputTokens);
        span.setAttribute("llm.cost_usd", cost);

        const month = currentMonth();
        const bucket = spend.get(key);
        if (bucket && bucket.month === month) {
          bucket.spentUsd += cost;
        } else {
          spend.set(key, { month, spentUsd: cost });
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return cost;
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

export function budgetErrorResponse(
  result: Extract<BudgetResult, { ok: false }>,
) {
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function getSpendSnapshot() {
  const month = currentMonth();
  const rows: Array<{ key: string; spentUsd: number }> = [];
  for (const [key, b] of spend) {
    if (b.month === month) rows.push({ key, spentUsd: b.spentUsd });
  }
  return { month, monthlyBudget: MONTHLY_BUDGET, keys: rows };
}
