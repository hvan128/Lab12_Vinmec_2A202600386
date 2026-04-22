# Cost Optimization Debate

**Project**: VinmecCare AI Agent (healthcare appointment scheduling bot)
**Stack**: Next.js 14 + Vercel Postgres + Prisma + OpenAI + OpenTelemetry + Jaeger
**Current volume**: ~7 users/day, ~18 requests/day, ~540 req/month
**Monthly LLM budget**: $0.50 (hard cap)

---

## Current Cost Anatomy

| Lớp | Chi phí/tháng | % |
|-----|-------------|---|
| Compute (VPS + Postgres) | $45 | 29% |
| Maintenance (4h/mo) | $80 | 51% |
| Human Review (2h/mo) | $30 | 19% |
| LLM tokens | $0.59 | **0.3%** |
| Logging (traces) | $0.25 | 0.2% |
| Storage (5GB) | $0.70 | 0.5% |
| **TOTAL MVP** | **$156.54** | 100% |

> **Critical insight**: LLM chỉ chiếm 0.3% tổng chi phí. Tối ưu LLM 100% đi, tiết kiệm được $0.59/tháng — không đáng effort. Ngược lại, infrastructure và human labor chiếm 99%+ mới là battlefield thực sự.

---

## 3 Chiến Lược Được Chọn

### 1. Prompt Compression

**Mức độ tiết kiệm**: Medium-low trong absolute, nhưng **free và low-risk** — không cần thay đổi kiến trúc.

**Phân tích chi tiết**:

- **Current system prompt**: ~2,000 tokens base + 1,500 tokens golden examples = **3,500 tokens/input**
- **System prompt breakdown** (từ tracing docs):
  - Base persona + rules: ~1,200 tokens
  - Tool instructions + workflow: ~600 tokens
  - Golden examples (5 positive + 3 negative): ~1,500 tokens
  - Display format rules: ~200 tokens
  - Total system: ~3,500 tokens

- **LLM cost với current system prompt** (18 req/day × 30 days = 540 req/month):
  - Input: 3,500 + 150 (user query) = 3,650 tokens × $0.00015/1K = **$0.49/mo** (agent)
  - Judge: 540 × (827 + 61) tokens = ~479K tokens × $0.00015/$0.0006 = **$0.21/mo**
  - **Total LLM: ~$0.70/mo** (trong budget $0.50 — đang over, budget check fail)

- **Sau khi compress** (reduce golden examples, streamline rules):
  - Target: 1,800 tokens system prompt (-49%)
  - Input: 1,800 + 150 = 1,950 tokens × $0.00015 = $0.28/mo agent input
  - Judge remains same if quality doesn't degrade
  - **Estimated savings: $0.25–0.35/mo** (but budget already set at $0.50, so this prevents budget overflow)

**Lợi ích**:
- Giảm token/req → tránh budget overflow khi có burst traffic
- Reduce latency (fewer tokens in context = faster generation)
- Không ảnh hưởng quality nếu compress đúng cách

**Trade-off**:
- Risk quality degradation nếu cắt golden examples quá đà
- System prompt hiện tại có nhiều redundant formatting rules
- Cần A/B test để verify quality

**Thời điểm áp dụng**: **Làm ngay** — gần như không có risk, có thể test ngay.

---

### 2. Model Routing (Tiered Inference)

**Mức độ tiết kiệm**: Medium, nhưng **cần kiến trúc mới**.

**Phân tích chi tiết**:

- **Traffic segmentation** (từ trace data):
  - Simple FAQ: ~30% (không cần tool, chỉ hỏi thông tin)
  - Appointment queries: ~25% (check status, history)
  - Booking flows: ~35% (require multi-step tool chains)
  - Complex symptom → department: ~10% (cần reasoning phức tạp)

- **Routing logic gợi ý**:
  - `gpt-4o-mini` → Simple FAQ, appointment status, greeting
  - `gpt-4o` → Complex symptom classification, multi-step booking, reschedule logic
  - Fallback: all go to gpt-4o-mini by default, upgrade on criteria

- **Routing criteria** (simple heuristics, không cần ML):
  ```typescript
  const routeToExpensive = (
    query: string,
    toolsUsed: string[],
  ): boolean => {
    // Upgrade to gpt-4o if:
    // 1. query mentions symptom/đau/nhức/khó chịu (potential department routing)
    // 2. tool chain includes reschedule (risky action, needs higher quality)
    // 3. conversation has 3+ tool calls (multi-step complexity)
    // 4. user asks to cancel/reschedule (high stakes medical scheduling)
  };
  ```

- **Estimated savings**:
  - 30% simple queries: stay on gpt-4o-mini (already cheap)
  - 10% complex queries: gpt-4o @ $3.75/1M input vs $0.15/1M — **more expensive**
  - Wait, this doesn't save money. The routing actually increases cost for complex queries.

- **Revised routing strategy** — tier DOWN simple queries:
  - 40% queries "simple FAQ + appointment status": route to `gpt-4o-mini` (keep as-is)
  - 10% "very simple greeting/no-tool": try `gpt-3.5-turbo` (cheapest option)
  - 50% complex bookings: keep on `gpt-4o-mini` (current model)

- **Cost modeling** (540 req/month):
  - 162 req × gpt-3.5-turbo: $0.0005/1K input × 500 tokens = $0.04/mo
  - 216 req × gpt-4o-mini: $0.00015/1K × 3000 tokens = $0.10/mo
  - 162 req × gpt-4o: $0.003/1K × 3500 tokens = $1.70/mo
  - **Total: $1.84/mo** — MORE expensive than current

- **Honest assessment**: Model routing at 540 req/month with current model mix **does NOT save money**. gpt-4o-mini is already the cheapest viable model. gpt-4o is 20× more expensive. Only makes sense if:
  - Volume > 10K req/month AND
  - Simple query % > 60%

**Lợi ích**:
- Quality improvement for complex cases (gpt-4o is smarter)
- Reduce hallucination on risky medical scheduling actions

**Trade-off**:
- Added latency (routing decision + model switch)
- Increased complexity (need evaluation framework)
- Cost may INCREASE if routing không đúng

**Thời điểm áp dụng**: **Để sau** — cần volume > 5K req/month mới có net positive. Hiện tại không justified.

---

### 3. Semantic Caching

**Mức độ tiết kiệm**: Low-medium trong absolute, nhưng **strategic cho healthcare use case**.

**Phân tích chi tiết**:

- **Healthcare scheduling patterns**:
  - Users often ask: "Tình trạng lịch khám của tôi", "Bác sĩ X có lịch ngày nào", "Giờ làm việc" — **highly repetitive**
  - 7 users/day × 2.5 req/user = 18 req/day, but many are repeat questions
  - Jaeger traces show ~60% queries are variations of FAQ and status checks

- **Cache hit rate estimation**:
  - Short-term cache (5 min): ~15% hit rate (intra-session repeats)
  - Medium cache (1 hour): ~25% hit rate (same user, different time)
  - Long-term cache (1 day): ~35% hit rate (common questions)

- **Implementation approach**:
  ```typescript
  // Semantic cache key: hash of (userId, normalized_query_embedding)
  // Store: query_hash → { response_text, tool_calls, expiry }
  // Use cosine similarity for semantic match, not exact string match

  // Approximate savings per cached hit:
  // Saved: full LLM call (3500 input + 200 output tokens)
  // Cost saved: $0.00065 per hit (vs. full LLM call)
  ```

- **Estimated savings** (conservative, 20% hit rate):
  - 540 req/month × 20% hit rate = 108 cached responses
  - 108 × $0.00065 = **$0.07/mo saved**
  - Against Redis cost: $5–12/mo (small instance) — **net negative**

- **Cache sizing for healthcare**:
  - Store last 7 days of query embeddings
  - Max 1K unique queries typical for appointment domain
  - Storage: 1K × 1536 dim × 4 bytes ≈ 6MB (negligible)
  - But Redis instance minimum is ~$5/mo

- **When this makes sense**:
  - Volume > 2K req/month AND
  - Cache hit rate > 40% AND
  - Using in-process cache (HashMap) instead of Redis

**Lợi ích**:
- Reduce LLM cost (100% savings on cached hits — no API call needed)
- Reduce latency (cache hit = instant response)
- Better UX (instant answers for repeat questions)
- Strategic for healthcare: "Tôi muốn xem lịch khám" repeated weekly

**Trade-off**:
- Redis/infrastructure cost may exceed savings at low volume
- Semantic embedding cost (small but real): 1536-dim vector × 540 req = negligible
- Cache invalidation complexity (tool results change frequently)
- Not suitable for booking flows (slots change constantly)

**Thời điểm áp dụng**: **Để sau** — với volume hiện tại, infrastructure cost > savings. Khi volume > 2K req/month, implement in-process cache trước (không cần Redis).

---

## Summary & Recommendation

### Chọn làm ngay

| Chiến lược | Lý do | Expected savings |
|-----------|-------|-----------------|
| **Prompt Compression** | Free, low-risk, immediate. System prompt có thể cắt từ 3500 → 2000 tokens mà không mất quality nếu làm đúng cách. Ngay cả khi không save money, giảm token = giảm latency + tránh budget overflow. | $0.10–0.30/mo token savings + latency improvement |

### Để sau

| Chiến lược | Lý do | Threshold để reconsider |
|-----------|-------|------------------------|
| **Model Routing** | gpt-4o-mini đã là cheap option. Routing lên gpt-4o tăng cost. Cần > 5K req/month + 60%+ simple queries mới có net positive. | > 5K req/month, 60%+ FAQ queries |
| **Semantic Caching** | Infrastructure cost (Redis) > savings ở 540 req/month. Nếu dùng in-process cache thì free, nhưng cần volume > 2K req/month để hit rate justify effort. | > 2K req/month, or implement in-process cache for free |

### Cái không được chọn

| Chiến lược | Lý do loại |
|-----------|-----------|
| **Self-hosted model** | Với 540 req/month, mất ~$0.59/mo cho OpenAI. Self-hosted cần GPU ($50–100/mo), setup time, maintenance. ROI trong 5+ năm. Không phù hợp scale nhỏ. |
| **Smaller model (gpt-3.5)** | Không đáng quality tradeoff cho medical scheduling. gpt-4o-mini là sweet spot giữa cost và capability. |
| **Selective inference (heavy/throttled)** | Đã có budget guard + rate limiting. Thêm throttling chỉ làm UX tệ hơn mà không save thêm cost. |

---

## Priority Action Items

1. **Prompt Compression (Week 1)**:
   - Audit current system prompt, identify redundant sections
   - Reduce golden examples from 5+3 → 2+1
   - Streamline workflow rules (remove duplicate format rules)
   - Target: system prompt ≤ 2,000 tokens
   - A/B test quality trước khi deploy

2. **Metric Baseline (Week 1)**:
   - Track cache hit rate, query complexity distribution
   - Để data-driven quyết định routing/caching sau này

3. **Re-evaluate at 2K req/month**:
   - At 2K req/month: semantic caching (in-process) becomes positive
   - At 5K req/month: model routing becomes worth the complexity