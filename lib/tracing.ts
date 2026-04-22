/**
 * OpenTelemetry Tracing Setup — Vinmec AI Agent
 *
 * SDK auto-initializes on import. Spans created via tracer.startActiveSpan().
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { trace, Tracer, SpanStatusCode } from "@opentelemetry/api";

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "vinmec-ai-agent";

// SDK init (runs once on import — works in Node.js runtime, not edge)
let sdk: NodeSDK | null = null;
try {
  const exporter = new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"}/v1/traces`,
  });
  sdk = new NodeSDK({
    traceExporter: exporter,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: "1.0.0",
    }),
  });
  sdk.start();
} catch (e) {
  console.warn("[tracing] SDK init failed:", e);
}

export { SpanStatusCode };

export const tracer: Tracer = trace.getTracer(SERVICE_NAME, "1.0.0");

export const LLM_PRICES = {
  inputPer1M: 0.15,
  outputPer1M: 0.60,
} as const;

export function calcLLMCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * LLM_PRICES.inputPer1M +
    (outputTokens / 1_000_000) * LLM_PRICES.outputPer1M
  );
}
