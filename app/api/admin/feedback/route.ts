import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "vinmec-demo-2026";
const SYSTEM_SHORT =
  "Bạn là Trợ lý ảo VinmecCare — chatbot chính thức của Vinmec, hỗ trợ đặt lịch khám, tư vấn khoa phù hợp, và giải đáp thắc mắc về bệnh viện.";

function checkAuth(req: NextRequest): boolean {
  const key = req.nextUrl.searchParams.get("key");
  return key === ADMIN_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const format = searchParams.get("format");
  const rating = searchParams.get("rating") ?? "all";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 1000);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (rating === "up" || rating === "down") {
    where.rating = rating;
  }

  // ── JSONL export ──────────────────────────────────────────────
  if (format === "jsonl") {
    const feedbacks = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { user: { select: { name: true } } },
    });

    const lines = feedbacks
      .map((f) =>
        JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_SHORT },
            { role: "user", content: f.query },
            { role: "assistant", content: f.response },
          ],
          metadata: {
            rating: f.rating,
            reason: f.reason,
            tools: f.toolsUsed,
            userId: f.userId,
            userName: f.user.name,
            createdAt: f.createdAt,
          },
        })
      )
      .join("\n");

    const date = new Date().toISOString().slice(0, 10);
    return new Response(lines, {
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Disposition": `attachment; filename="vinmec-feedback-${date}.jsonl"`,
      },
    });
  }

  // ── JSON list ─────────────────────────────────────────────────
  const [feedbacks, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { user: { select: { name: true } } },
    }),
    prisma.feedback.count({ where }),
  ]);

  return NextResponse.json({ feedbacks, total });
}
