import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { tracer, calcLLMCost, SpanStatusCode } from "@/lib/tracing";

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "gpt-4o-mini";

const JudgeResultSchema = z.object({
  correctDepartment: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Có đề xuất đúng khoa theo triệu chứng không? (1-5)"),
  toolUsageComplete: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe(
      "Có gọi đủ chuỗi tool cần thiết không (recommend → list_doctors → check_availability → book)? (1-5)"
    ),
  toneAppropriate: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe(
      "Tone có phù hợp với user (anh/chị/bạn, đúng giới tính nếu có), thân thiện, chuyên nghiệp? (1-5)"
    ),
  concise: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Ngắn gọn, không lan man, không lặp lại? (1-5)"),
  followedWorkflow: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe(
      "Có tuân thủ rule hệ thống (working hours 07-20, bắt buộc check_availability trước book/reschedule)? (1-5)"
    ),
  overall: z.number().min(1).max(5).describe("Điểm tổng (trung bình 5 tiêu chí)"),
  rationale: z.string().describe("Giải thích ngắn gọn (1-2 câu tiếng Việt)"),
});

const JUDGE_SYSTEM = `Bạn là giám khảo đánh giá chất lượng câu trả lời của trợ lý ảo VinmecCare.

Chấm 5 tiêu chí, mỗi tiêu chí 1–5:
1. correctDepartment: Có đề xuất đúng khoa theo triệu chứng không?
2. toolUsageComplete: Có gọi đủ chuỗi tool cần thiết không (recommend → list_doctors → check_availability → book)?
3. toneAppropriate: Tone có phù hợp với user (anh/chị/bạn, đúng giới tính nếu có), thân thiện, chuyên nghiệp?
4. concise: Ngắn gọn, không lan man, không lặp lại?
5. followedWorkflow: Có tuân thủ rule hệ thống (working hours 07:00-20:00, bắt buộc check_availability trước book/reschedule)?

Lưu ý: Nếu câu hỏi không liên quan đến đặt lịch/khoa/bác sĩ, chấm toolUsageComplete=5 (không cần dùng tool là đúng), correctDepartment=5 (không áp dụng).
Trả về JSON theo schema đã cho.`;

export async function scoreAsync(
  userId: string,
  userQuery: string,
  botResponse: string,
  toolsUsed: string[],
  feedbackId?: string
): Promise<void> {
  tracer.startActiveSpan(
    "judge.score_async",
    {
      attributes: {
        "judge.user_id": userId,
        "judge.model": JUDGE_MODEL,
        "judge.tools_used_count": toolsUsed.length,
      },
    },
    async (span) => {
      try {
        const start = Date.now();

        const { object, usage } = await generateObject({
          model: openai(JUDGE_MODEL),
          schema: JudgeResultSchema,
          system: JUDGE_SYSTEM,
          prompt: `User hỏi: "${userQuery}"\n\nBot trả lời: "${botResponse}"\n\nCác tool đã gọi: [${toolsUsed.join(", ") || "không có"}]`,
        });

        const judgeInput = usage?.inputTokens ?? 0;
        const judgeOutput = usage?.outputTokens ?? 0;
        const judgeCost = calcLLMCost(judgeInput, judgeOutput);
        const latency = Date.now() - start;

        span.setAttributes({
          "judge.input_tokens": judgeInput,
          "judge.output_tokens": judgeOutput,
          "judge.cost_usd": judgeCost,
          "judge.latency_ms": latency,
          "judge.overall_score": object.overall,
        });

        const overallScore =
          (object.correctDepartment +
            object.toolUsageComplete +
            object.toneAppropriate +
            object.concise +
            object.followedWorkflow) /
          5;

        await prisma.qualityScore.create({
          data: {
            userId,
            userQuery,
            botResponse,
            toolsUsed,
            correctDepartment: object.correctDepartment,
            toolUsageComplete: object.toolUsageComplete,
            toneAppropriate: object.toneAppropriate,
            concise: object.concise,
            followedWorkflow: object.followedWorkflow,
            overallScore,
            judgeRationale: object.rationale,
            feedbackId: feedbackId ?? null,
          },
        });

        console.log(
          `[judge] scored userId=${userId} overall=${overallScore.toFixed(2)} ` +
            `tokens=${judgeInput + judgeOutput} cost=$${judgeCost.toFixed(6)} latency=${latency}ms`
        );
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      } catch (err) {
        const e = err as Error;
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
        span.recordException(e);
        span.end();
        console.error("[judge] scoreAsync error:", err);
      }
    },
  );
}
