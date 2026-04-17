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

export function checkBudget(key: string, estTokens = 500): BudgetResult {
  const month = currentMonth();
  const bucket = spend.get(key);
  const current = bucket && bucket.month === month ? bucket.spentUsd : 0;
  const estCost = (estTokens / 1000) * INPUT_PRICE_PER_1K;

  if (current + estCost > MONTHLY_BUDGET) {
    return {
      ok: false,
      status: 402,
      error: `Monthly budget exceeded ($${MONTHLY_BUDGET}). Resets next month.`,
    };
  }

  return {
    ok: true,
    spentUsd: current,
    remainingUsd: Math.max(0, MONTHLY_BUDGET - current),
  };
}

export function recordUsage(
  key: string,
  inputTokens: number,
  outputTokens: number,
) {
  const cost =
    (inputTokens / 1000) * INPUT_PRICE_PER_1K +
    (outputTokens / 1000) * OUTPUT_PRICE_PER_1K;
  const month = currentMonth();
  const bucket = spend.get(key);
  if (bucket && bucket.month === month) {
    bucket.spentUsd += cost;
  } else {
    spend.set(key, { month, spentUsd: cost });
  }
  return cost;
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
