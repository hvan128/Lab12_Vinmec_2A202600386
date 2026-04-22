# Cost Anatomy Lab — Trace Log

## 3.4. Cost Anatomy Lab

> **Nguồn dữ liệu**: Jaeger + OpenTelemetry tracing
> Query: `curl http://localhost:16686/api/traces?service=vinmec-ai-agent`

---

### 1. Ước lượng Users & Requests

| Chỉ số | Giá trị |
|--------|---------|
| **Users/ngày** | **~7 users/ngày** (budget-constrained) |
| **Requests/ngày** | **~18 req/ngày** ($0.50 ÷ $0.000796/req) |
| **Avg requests/user** | 2.5 req |
| **Peak hours** | 9–11h, 14–16h (40% traffic tập trung) |
| **Peak req/giờ** | ~2 req/giờ |
| **Peak req/phút** | ~1 req/phút |
| **Concurrent @peak** | ~1 user |

---

### 2. Token Breakdown Mỗi Request (GPT-4o-mini)

#### Estimated vs Real (Jaeger Traces)

| Thành phần | Estimated | **Real (Jaeger)** |
|------------|-----------|-------------------|
| System prompt (base) | 2,000 | — |
| Golden examples | 1,500 | — |
| User query | 150 | — |
| Tool results | 300 | — |
| History (2 msg) | 160 | — |
| **Agent input** | **4,110** | **3,969** |
| **Agent output** | **200** | **66** |
| Judge input | 600 | 827 |
| Judge output | 150 | 61 |
| **Total tokens/req** | **5,710** | **4,923** |

#### Real Trace Data

```
TraceID: 8a26e188e589d4ae2e7fd483331349f1

llm.agent:
  input_tokens: 3969
  output_tokens: 66
  total_tokens: 4035
  cost_usd: $0.00063495
  model: gpt-4o-mini
  tools_called: 0

judge.score_async:
  input_tokens: 827
  output_tokens: 61
  cost_usd: $0.00016065
  latency_ms: 2229
  overall_score: 5

ratelimit.check:
  remaining: 10 (limit 10/min)

budget.check:
  current_spent_usd: $0.00250
  remaining_usd: $0.497
  est_input_tokens: 2534
  est_output_tokens: 100
  est_cost_usd: $0.00044
```

---

### 3. So Sánh Estimate vs Real

| Metric | Estimated | Real (Jaeger) | Delta |
|--------|-----------|---------------|-------|
| Input tokens | 2,534 | **3,969** | +57% |
| Output tokens | 100 | **66** | -34% |
| Total tokens | ~4,110 | **4,035** | -2% |
| LLM cost/req | $0.000736 | **$0.00063495** | -14% |
| Judge cost/req | $0.000180 | **$0.00016065** | -11% |
| **Total cost/req** | ~$0.000916 | **$0.00079560** | **-13%** |

> **Observation**: Estimate dưới input tokens nhưng trên output tokens. Net effect: estimate cao hơn thực tế 13%.

---

### 4. Các Lớp Chi Phí

| Lớp | Monthly | % |
|-----|---------|---|
| Token (LLM) | $0.59 | 0.3% |
| Compute (VPS + PG) | $45 | 29% |
| Storage (5GB) | $0.70 | 0.5% |
| Human Review (2h/mo) | $30 | 19% |
| Logging | $0.25 | 0.2% |
| Maintenance (4h/mo) | $80 | 51% |
| **TOTAL MVP** | **$156.54** | 100% |

### 5. MVP Cost Breakdown (Real Data)

| Thành phần | Monthly | Notes |
|------------|---------|-------|
| LLM Agent (3,969 in + 66 out tokens) | $0.63/mo | Real trace: $0.00063495/req |
| Judge (827 in + 61 out tokens) | $0.16/mo | Real trace: $0.00016065/req |
| Token Total | **$0.79/mo** | ~18 req/day |
| Compute (VPS) | $30 | 2CPU/4GB |
| PostgreSQL | $15 | |
| Storage | $0.70 | 5GB |
| Human Review | $30 | 2h × $15/h |
| Logging | $0.25 | |
| Maintenance | $80 | 4h × $20/h |
| **TOTAL** | **$156.70** | |

---

### 6. Scale Scenarios (5x / 10x)

| Scenario | Users/ngày | LLM Cost/mo | Total/mo | Notes |
|----------|-----------|-------------|----------|-------|
| Demo | ~7 | $0.80 | $157 | Real trace data |
| **5x** | ~35 | $4.00 | **$295** | |
| **10x** | ~70 | $8.00 | **$315** | |

**Phần tăng mạnh nhất khi scale:**
1. **Token cost (LLM)** — tăng tuyến tính với users
2. **Compute** — tăng đột biến khi cần multi-replica
3. **Human Review** — tăng khi quality issues tăng theo volume

---

## Câu hỏi nhóm phải trả lời

### Cost driver lớn nhất của hệ thống là gì?

**Ở MVP scale (7 users):** Maintenance ($80, 51%) → Compute ($45, 29%)

**Ở production scale (10,000 users):** Token cost chiếm ~58% ($750 của $1,217 total)

**=> Cost driver thay đổi theo scale:**
- Small: **Maintenance + Compute** dominate
- Large: **Token (LLM)** dominate

### Hidden cost dễ bị quên nhất?

1. **Human Review** — bị quên khi estimate MVP, nhưng healthcare compliance bắt buộc
2. **Maintenance engineering hours** — 4h/tháng × $20/h = $80, dễ bị coi là "free"
3. **Judge scoring** — $0.00016/req, nhỏ nhưng tích lũy
4. **Memory/in-memory state loss** — costGuard & rateLimit reset khi container restart, production cần Redis → thêm $30/tháng
5. **OTEL endpoint calls** — mỗi span ghi thêm 1 HTTP POST tới Jaeger collector, có overhead nhưng negligible

### Đội có chỗ nào đang ước lượng quá lạc quan?

1. **Rate limit 10 req/min** — có thể quá thấp cho production, users sẽ hit limit và chuyển sang competitor

2. **In-memory rate limit + budget** — production cần Redis, thêm $30/tháng (không tính trong MVP)

3. **Human review 2h/tháng** — realistic với ~7 users. Khi 10,000 users → feedback volume tăng ~1,400x → 2h không đủ

4. **Maintenance 4h/tháng** — đánh giá thấp. Khi hệ thống lớn, incident response sẽ tốn nhiều hơn

5. **System prompt 2000 tokens** — có thể cắt giảm 50% bằng cách tối ưu prompt, giảm cost mà không mất chất lượng

6. **Estimate vs Real mismatch**: Input token estimate thấp hơn thực tế 57%, có thể dẫn đến budget không đủ

---

## OpenTelemetry Tracing Integration

### Cấu hình

```yaml
# docker-compose.yml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "4318:4318"   # OTLP HTTP receiver
    - "6831:6831/udp"  # OTLP gRPC
    - "16686:16686"  # Jaeger UI
  environment:
    COLLECTOR_OTLP_ENABLED: "true"

# App environment
OTEL_SERVICE_NAME=vinmec-ai-agent
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

### Trace Flow thực tế

```
POST /api/chat
  ├─ span: auth.verify_api_key
  ├─ span: ratelimit.check
  │    attributes: ratelimit.remaining=10, ratelimit.limit=10
  ├─ span: budget.check
  │    attributes: budget.est_input_tokens=2534, budget.est_cost_usd=0.00044
  ├─ span: llm.agent        ← Real tokens từ OpenAI
  │    attributes:
  │      llm.input_tokens=3969
  │      llm.output_tokens=66
  │      llm.cost_usd=0.00063495
  │      llm.tools_called=0
  └─ span: judge.score_async  ← Judge LLM call
       attributes:
         judge.input_tokens=827
         judge.output_tokens=61
         judge.cost_usd=0.00016065
         judge.latency_ms=2229
         judge.overall_score=5
```

### Khởi động

```bash
# Start Jaeger + App cùng lúc
docker compose --profile tracing up -d

# Hoặc start riêng
docker compose --profile tracing up -d jaeger

# Query traces
curl http://localhost:16686/api/traces?service=vinmec-ai-agent&limit=10
```

### UI Access

```
Jaeger UI: http://localhost:16686
```

---

## Files Reference

| File | Mô tả |
|------|-------|
| `lib/tracing.ts` | OpenTelemetry SDK initialization + helpers |
| `lib/costGuard.ts` | Budget guard với spans (checkBudget, recordUsage) |
| `lib/rateLimit.ts` | Rate limiter với spans |
| `lib/agent/judge.ts` | Judge scoring với spans |
| `app/api/chat/route.ts` | Chat endpoint với LLM span |
| `docker-compose.yml` | Jaeger service (`--profile tracing`) |
| `.env` | OTEL_* environment variables |
| `scripts/cost-estimator.js` | Cost estimation script |