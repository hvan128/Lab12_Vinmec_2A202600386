import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const feedbackSchema = z.object({
  userId: z.string(),
  messageId: z.string(),
  rating: z.enum(["up", "down"]),
  reason: z.string().optional(),
  query: z.string(),
  response: z.string(),
  toolsUsed: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body không hợp lệ" },
      { status: 400 }
    );
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    const field = firstError.path.join(".");
    let msg = "Dữ liệu không hợp lệ";
    if (field === "rating") msg = "Thiếu hoặc sai giá trị rating (up/down)";
    else if (field === "userId") msg = "Thiếu userId";
    else if (field === "messageId") msg = "Thiếu messageId";
    else if (field === "query") msg = "Thiếu nội dung câu hỏi";
    else if (field === "response") msg = "Thiếu nội dung câu trả lời";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { userId, messageId, rating, reason, query, response, toolsUsed } =
    parsed.data;

  try {
    const feedback = await prisma.feedback.create({
      data: {
        userId,
        messageId,
        rating,
        reason: reason ?? null,
        query,
        response,
        toolsUsed,
      },
    });

    return NextResponse.json({ ok: true, id: feedback.id });
  } catch (err) {
    console.error("[feedback] DB error:", err);
    return NextResponse.json(
      { error: "Không thể lưu phản hồi, vui lòng thử lại sau" },
      { status: 500 }
    );
  }
}
