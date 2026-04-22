import { getSystemPrompt } from "@/lib/agent/system-prompt";

const CACHE_TTL_MS = 60_000;

// Approximate static prefix size — base prompt + golden examples.
// This is the portion OpenAI prefix-caches at 50% discount when the string
// is identical across requests (which our app cache guarantees within 60s).
export const STATIC_PREFIX_TOKENS = 3_500;

// OpenAI gpt-4o-mini cached input price = $0.075/1M (50% of $0.15/1M)
export const CACHED_INPUT_PRICE_PER_1M = 0.075;

let _entry: { prompt: string; builtAt: number } | null = null;
let _hits = 0;
let _misses = 0;

/**
 * Returns the cached system prompt (base + golden examples).
 * TTL is 60s, matching the golden-loader cache, so consecutive requests
 * within the window produce byte-for-byte identical strings — which lets
 * OpenAI's automatic prefix cache hit on the static ~3 500-token prefix.
 */
export async function getCachedSystemPrompt(): Promise<{
  prompt: string;
  appCacheHit: boolean;
}> {
  const now = Date.now();
  if (_entry && now - _entry.builtAt < CACHE_TTL_MS) {
    _hits++;
    return { prompt: _entry.prompt, appCacheHit: true };
  }
  const prompt = await getSystemPrompt();
  _misses++;
  _entry = { prompt, builtAt: now };
  return { prompt, appCacheHit: false };
}

export function getPromptCacheStats() {
  const total = _hits + _misses;
  return {
    hits: _hits,
    misses: _misses,
    hitRatio: total > 0 ? _hits / total : 0,
  };
}

export function invalidatePromptCache(): void {
  _entry = null;
}
