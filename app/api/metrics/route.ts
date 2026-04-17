/**
 * Protected metrics endpoint — Lab 12 compliant.
 * Chỉ trả metrics cho client có API key hợp lệ (tránh leak usage data).
 */
import { NextResponse } from "next/server";
import { verifyApiKey, authErrorResponse } from "@/lib/auth";
import { getSpendSnapshot } from "@/lib/costGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = verifyApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);

  const snapshot = getSpendSnapshot();
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || "1.0.0",
    ...snapshot,
  });
}
