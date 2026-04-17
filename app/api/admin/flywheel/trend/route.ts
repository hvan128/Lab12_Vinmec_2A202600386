import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "vinmec-demo-2026";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== ADMIN_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.min(
    parseInt(req.nextUrl.searchParams.get("days") ?? "14", 10),
    90
  );

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const scores = await prisma.qualityScore.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, overallScore: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by date (YYYY-MM-DD in VN time UTC+7)
  const byDate = new Map<string, { sum: number; count: number }>();

  for (const s of scores) {
    const vnDate = new Date(s.createdAt.getTime() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const existing = byDate.get(vnDate) ?? { sum: 0, count: 0 };
    existing.sum += s.overallScore;
    existing.count += 1;
    byDate.set(vnDate, existing);
  }

  const trend = Array.from(byDate.entries())
    .map(([date, { sum, count }]) => ({
      date,
      avgScore: parseFloat((sum / count).toFixed(2)),
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Summary stats
  const todayVN = new Date(Date.now() + 7 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayData = byDate.get(todayVN);
  const todayAvg = todayData
    ? parseFloat((todayData.sum / todayData.count).toFixed(2))
    : null;

  const activeExamples = await prisma.goldenExample.count({
    where: { enabled: true },
  });

  // Promotion rate last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [feedbackCount7d, promotedCount7d] = await Promise.all([
    prisma.feedback.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.goldenExample.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);
  const promotionRate =
    feedbackCount7d > 0
      ? parseFloat(((promotedCount7d / feedbackCount7d) * 100).toFixed(1))
      : 0;

  return NextResponse.json({
    trend,
    summary: {
      todayAvgScore: todayAvg,
      activeExamples,
      promotionRate7d: promotionRate,
    },
  });
}
