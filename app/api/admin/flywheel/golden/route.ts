import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { invalidateCache } from "@/lib/agent/golden-loader";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "vinmec-demo-2026";

function checkAuth(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("key") === ADMIN_KEY;
}

// GET /api/admin/flywheel/golden?key=...
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10),
    200
  );
  const sourceType = req.nextUrl.searchParams.get("type"); // "positive" | "negative" | null

  const where = sourceType
    ? { sourceType }
    : {};

  const [examples, total] = await Promise.all([
    prisma.goldenExample.findMany({
      where,
      orderBy: [{ enabled: "desc" }, { sourceScore: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.goldenExample.count({ where }),
  ]);

  return NextResponse.json({ examples, total });
}

const PatchSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
});

// PATCH /api/admin/flywheel/golden?key=... — toggle enable/disable
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "id and enabled required" }, { status: 400 });
  }

  const updated = await prisma.goldenExample.update({
    where: { id: parsed.data.id },
    data: { enabled: parsed.data.enabled },
  });

  // Invalidate golden cache so next chat reflects the change immediately
  invalidateCache();

  return NextResponse.json({ example: updated });
}
