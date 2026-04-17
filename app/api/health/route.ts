/**
 * Liveness probe — Lab 12 compliant.
 * Trả 200 khi process còn sống. Platform / Docker healthcheck gọi endpoint này.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const START_TIME = Date.now();
const VERSION = process.env.APP_VERSION || "1.0.0";
const ENVIRONMENT = process.env.NODE_ENV || "development";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: VERSION,
    environment: ENVIRONMENT,
    uptime_seconds: Math.round((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  });
}
