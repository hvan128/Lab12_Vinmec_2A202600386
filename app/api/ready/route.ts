/**
 * Readiness probe — Lab 12 compliant.
 * Trả 200 chỉ khi sẵn sàng nhận traffic (DB connection alive).
 * Load balancer dùng endpoint này để drain traffic khi container không ready.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | string> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    ok = false;
    checks.database = err instanceof Error ? err.message : "unreachable";
  }

  const hasKey = !!process.env.OPENAI_API_KEY;
  checks.openai_key = hasKey ? "ok" : "missing";
  if (!hasKey) ok = false;

  return NextResponse.json(
    { ready: ok, checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
