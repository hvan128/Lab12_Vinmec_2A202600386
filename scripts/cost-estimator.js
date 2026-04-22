/**
 * Vinmec AI Agent — Cost & Capacity Estimator
 * Run: node scripts/cost-estimator.js
 */

const config = {
  llm: { inputPricePer1M: 0.15, outputPricePer1M: 0.60, judgeInputPricePer1M: 0.15, judgeOutputPricePer1M: 0.60, model: "gpt-4o-mini" },
  rateLimit: { requestsPerMinute: 10 },
  budget: { monthlyUsd: 0.5 },
  usage: { avgSessionMinutes: 3, messagesPerSession: 6, toolCallsPerRequest: 1.5, peakHours: [9, 10, 11, 14, 15, 16], dailyActiveHours: 13 },
  tokens: { systemPromptBase: 2000, systemPromptGolden: 1500, userQueryInput: 150, toolResultTokens: 300, agentOutputTokens: 200, historyTokensPerMessage: 80, judgeInputTokens: 600, judgeOutputTokens: 150 },
  infra: { appMemoryMb: 1024, dbStorageGb: 5, appReplicas: 1, vpsCpuCores: 2, vpsRamGb: 4, vpsPricePerMonth: 30, postgresPricePerMonth: 15 },
};

// Token per request
const t = config.tokens;
const agentInput = t.systemPromptBase + t.systemPromptGolden + t.userQueryInput + t.toolResultTokens + t.historyTokensPerMessage * 2;
const agentOutput = t.agentOutputTokens;
const judgeInput = t.judgeInputTokens;
const judgeOutput = t.judgeOutputTokens;
const totalTokens = agentInput + agentOutput + judgeInput + judgeOutput;

// Costs
const INPUT_COST = 0.15 / 1e6;
const OUTPUT_COST = 0.60 / 1e6;
const agentCost = (agentInput * INPUT_COST) + (agentOutput * OUTPUT_COST);
const judgeCost = (judgeInput * INPUT_COST) + (judgeOutput * OUTPUT_COST);
const costPerReq = agentCost + judgeCost;
const budgetPerDay = config.budget.monthlyUsd / 30;
const reqPerDay = Math.floor(budgetPerDay / costPerReq);
const usersPerDay = Math.floor(reqPerDay / 2.5);
const activeMin = config.usage.dailyActiveHours * 60;
const maxReqDay = config.rateLimit.requestsPerMinute * activeMin;
const peakHours = config.usage.peakHours.length;
const peakReqHour = Math.ceil((reqPerDay * 0.40) / peakHours);

console.log("=".repeat(65));
console.log("  VINMEC AI AGENT — COST & CAPACITY ESTIMATION");
console.log("=".repeat(65));

console.log("\n## 1. TOKEN BREAKDOWN PER REQUEST");
console.log("-".repeat(50));
console.log(`  Agent INPUT:      ${agentInput.toLocaleString()} tokens`);
console.log(`    System prompt:  ${t.systemPromptBase}`);
console.log(`    Golden examples: ${t.systemPromptGolden}`);
console.log(`    User query:     ${t.userQueryInput}`);
console.log(`    Tool results:    ${t.toolResultTokens}`);
console.log(`    History (2 msg): ${t.historyTokensPerMessage * 2}`);
console.log(`  Agent OUTPUT:     ${agentOutput}`);
console.log(`  Judge INPUT:      ${judgeInput}`);
console.log(`  Judge OUTPUT:    ${judgeOutput}`);
console.log(`  ─────────────────────────────`);
console.log(`  TOTAL:           ${totalTokens.toLocaleString()} tokens/req`);
console.log(`  Cost/req:        $${costPerReq.toFixed(6)}`);
console.log(`    Agent:         $${agentCost.toFixed(6)}`);
console.log(`    Judge:         $${judgeCost.toFixed(6)}`);

console.log("\n## 2. CAPACITY ESTIMATES");
console.log("-".repeat(50));
console.log(`  Rate limit:           ${config.rateLimit.requestsPerMinute} req/min per key`);
console.log(`  Monthly budget:       $${config.budget.monthlyUsd}`);
console.log(`  Budget-constrained:   ${reqPerDay} req/day | ~${usersPerDay} users/day`);
console.log(`  Rate-limit ceiling:   ${maxReqDay} req/day`);
console.log(`  Peak hours:          ${config.usage.peakHours.join(", ")}h`);
console.log(`  Peak req/hour:       ~${peakReqHour}`);

console.log("\n## 3. COST LAYERS (monthly)");
console.log("-".repeat(50));

const layers = [
  ["Token (LLM)", reqPerDay * 30 * costPerReq],
  ["Compute (VPS+PG)", config.infra.vpsPricePerMonth + config.infra.postgresPricePerMonth],
  ["Storage (5GB)", 0.7],
  ["Human Review (2h/mo)", 30],
  ["Logging", 0.25],
  ["Maintenance (4h/mo)", 80],
];
const total = layers.reduce((s, [, v]) => s + v, 0);
layers.forEach(([n, v]) => {
  const pct = Math.round((v / total) * 100);
  const bar = "=".repeat(Math.floor(pct / 5)) + "-".repeat(20 - Math.floor(pct / 5));
  console.log(`  ${n.padEnd(22)} $${v.toFixed(2).padStart(8)}  [${bar}] ${pct}%`);
});
console.log("  " + "-".repeat(50));
console.log(`  ${"TOTAL".padEnd(22)} $${total.toFixed(2).padStart(8)}`);

console.log("\n## 4. SCALE SCENARIOS");
console.log("-".repeat(50));
const scenarios = [
  { label: "Demo (current)", users: 7, llmBudget: 0.5 },
  { label: "Small team", users: 200, llmBudget: 15 },
  { label: "Medium", users: 1000, llmBudget: 75 },
  { label: "Production", users: 10000, llmBudget: 750 },
];
scenarios.forEach((s) => {
  const reqD = s.users * 2.5;
  const cost = reqD * 30 * costPerReq;
  const compute = s.users > 1000 ? 120 : 45;
  const human = s.users > 1000 ? 150 : 30;
  const maint = s.users > 1000 ? 160 : 80;
  const totalS = cost + compute + human + maint + 5 + 0.25;
  console.log(`  ${s.label.padEnd(18)} | ${String(s.users).padStart(7)} users | LLM $${cost.toFixed(0).padStart(5)} | Total $${totalS.toFixed(0).padStart(5)}/mo`);
});

console.log("\n" + "=".repeat(65));
console.log("NOTE: Token cost is only ~0.3% at demo scale. Compute (29%)");
console.log("and Maintenance (51%) dominate. At production scale, LLM cost");
console.log("becomes ~58% of total.");
console.log("=".repeat(65) + "\n");
