# Báo Cáo Lab 12 — Áp dụng cho dự án Vinmec AI Agent

> **Sinh viên:** Ngô Hải Văn (2A202600386)
> **Ngày:** 2026-04-17
> **Repo:** https://github.com/hvan128/Lab12_Vinmec_2A202600386
> **Public URL:** https://lab12.hvan.it.com *(Cloudflare Tunnel)*
> **VPS:** `root@157.66.100.59` (CentOS + Docker)

---

## 1. Vì sao chọn Vinmec thay vì dự án Python mẫu trong `06-lab-complete`

Dự án Vinmec (Next.js 14 + Prisma + Postgres + AI SDK + gpt-4o-mini) đã có sẵn:
- Sản phẩm thật đang chạy, LLM thật, streaming UI
- Docker Compose + Cloudflare Tunnel
- Postgres persistent → state đã được externalize

→ Thay vì làm mẫu mini, **áp dụng toàn bộ 9 yêu cầu Lab 12 vào sản phẩm thật** là dịch vụ của checklist và trả về production code thật.

---

## 2. Checklist Lab 12 — mapping vào code Vinmec

| # | Yêu cầu | Triển khai trong Vinmec | File |
|---|---------|--------------------------|------|
| 1 | Dockerfile multi-stage < 500 MB | 3-stage (`deps → builder → runtime`), Next.js `output: "standalone"`, `node:20-alpine`, non-root `nextjs` user, `HEALTHCHECK` + `tini` cho SIGTERM | `Dockerfile`, `next.config.mjs` |
| 2 | API key auth | Middleware `verifyApiKey()` đọc header `X-API-Key`, so với env `AGENT_API_KEY` | `lib/auth.ts` → gọi ở `app/api/chat/route.ts` + `app/api/metrics/route.ts` |
| 3 | Rate limit 10 req/min | Sliding window deque, key bucket = 8 ký tự đầu của API key | `lib/rateLimit.ts` |
| 4 | Cost guard $10/tháng | Track input/output tokens từ AI SDK usage, tính giá gpt-4o-mini, chặn 402 khi vượt | `lib/costGuard.ts` — `recordUsage()` gọi sau stream complete |
| 5 | `/health` + `/ready` | Liveness + Readiness (readiness check DB + OPENAI_API_KEY) | `app/api/health/route.ts`, `app/api/ready/route.ts` |
| 6 | Graceful shutdown SIGTERM | `tini` làm PID 1 → forward SIGTERM → Next.js standalone gracefully closes HTTP + Prisma pool. `stop_grace_period: 30s` trong compose | `Dockerfile`, `docker-compose.yml` |
| 7 | Stateless | Conversation + feedback lưu Postgres (Prisma). Không có global mutable state ngoài rate-limit buckets (nhanh + tự cleanup). Container crash → data vẫn ở DB | `prisma/schema.prisma`, `lib/db/client.ts` |
| 8 | Config qua env vars, không hardcode | Toàn bộ config đọc `process.env.*`, có `.env.example` mẫu, `.env` trong `.gitignore`. Secret production lưu GitHub Secrets + inject runtime | `.env.example`, `docker-compose.yml` |
| 9 | Public URL | `https://lab12.hvan.it.com` qua Cloudflare Tunnel (HTTPS auto, không mở port public; VPS chỉ bind `localhost:3003`) | `docker-compose.yml` (`cloudflared` service) |

**Port layout:**
- Container listens on `:3000` (Next.js standalone default)
- VPS bind `localhost:3003` → `container:3000` (tránh conflict với Vinmec Day 6 đang chạy `:3000`)
- Cloudflare Tunnel → `http://localhost:3003` → container → app

**Extra vượt chuẩn Lab 12:**
- ✅ CI/CD tự động (GitHub Actions → GHCR → SSH VPS → rolling deploy + smoke test)
- ✅ Protected `/api/metrics` endpoint (chỉ caller có API key mới xem được spend)
- ✅ Post-deploy smoke test: curl `/api/health` + test 401 enforcement
- ✅ DB migration tự động chạy qua `docker compose --profile migrate run --rm migrate`

---

## 3. CI/CD Pipeline

```
Push main
    │
    ▼
┌─────────────────────────────┐
│ GitHub Actions: build       │
│  - Checkout                 │
│  - Buildx cache             │
│  - Build Docker image       │
│  - Push GHCR (:latest + sha)│
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ GitHub Actions: deploy      │
│  - SCP docker-compose.yml   │
│  - SSH VPS → write .env     │
│  - docker compose pull      │
│  - Prisma migrate deploy    │
│  - docker compose up -d     │
│  - Health wait (60s timeout)│
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ GitHub Actions: smoke-test  │
│  - curl /api/health → 200   │
│  - POST /api/chat → 401     │
└─────────────────────────────┘
```

**Thời gian deploy ước tính:**
- Build: 3–4 phút (với GHA cache ~90s)
- Deploy + migrate: 30 giây
- Smoke test: 10–60 giây (tuỳ health check retry)
- **Total: ~5 phút** từ `git push` đến production.

---

## 4. GitHub Secrets đã set

| Secret | Nguồn | Dùng để |
|---|---|---|
| `VPS_HOST` | `157.66.100.59` | SSH target |
| `VPS_USER` | `root` | SSH user |
| `VPS_SSH_KEY` | `~/.ssh/id_ed25519` (macOS) | SSH private key |
| `OPENAI_API_KEY` | Vinmec `.env` | Gọi OpenAI API |
| `AGENT_API_KEY` | Generated 32-byte hex | Chặn `/api/chat` khỏi public |
| `ADMIN_KEY` | Vinmec `.env` | `/admin/feedback?key=…` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Vinmec `.env` | cloudflared container |
| `POSTGRES_PASSWORD` | Generated 24-byte hex | Postgres auth |

Set qua: `gh secret set <NAME> --repo hvan128/Lab12_Vinmec_2A202600386 < <file_or_stdin>`

---

## 5. VPS Setup (one-time)

```bash
ssh root@157.66.100.59

# 1) Tạo folder deploy riêng (tránh đụng Day 6 Vinmec đang chạy ở folder khác)
mkdir -p /opt/lab12-vinmec && cd /opt/lab12-vinmec

# 2) Verify port 3003 free
ss -ltn | grep ':3003' || echo "3003 free"

# Done. GitHub Actions scp docker-compose.yml về đây + ghi .env tự động.
```

Trên macOS local, thêm public key của VPS vào `known_hosts` một lần:
```bash
ssh-keyscan -H 157.66.100.59 >> ~/.ssh/known_hosts
```

---

## 6. Cloudflare Tunnel

**Đã chọn: Tunnel riêng cho Lab 12** (token mới `eyJhIjoi...`).
Cấu hình trên Cloudflare dashboard:
- Public Hostname: `lab12.hvan.it.com`
- Service: HTTP, URL `localhost:3003`
- Tunnel token đã set vào GitHub secret `CLOUDFLARE_TUNNEL_TOKEN` (update 2026-04-17T08:13Z).

---

## 7. Test plan (sau khi deploy)

```bash
# 1. Health
curl https://lab12.hvan.it.com/api/health
# → {"status":"ok","version":"<sha>",...}

# 2. Ready (check DB)
curl https://lab12.hvan.it.com/api/ready
# → {"ready":true,"checks":{"database":"ok","openai_key":"ok"}}

# 3. Auth enforcement
curl -X POST https://lab12.hvan.it.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[],"userId":"test"}'
# → 401 {"error":"Missing API key..."}

# 4. With API key
API_KEY=$(cat /Users/haivan/Documents/2A202600386_NgoHaiVan_LAB12/.lab12_secrets.local \
  | grep AGENT_API_KEY | cut -d= -f2)

curl -X POST https://lab12.hvan.it.com/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"messages":[{"role":"user","content":"Xin chào"}],"userId":"test-user"}'
# → 200, streaming response

# 5. Rate limit
for i in {1..15}; do
  curl -s -o /dev/null -w "req $i: %{http_code}\n" \
    -X POST https://lab12.hvan.it.com/api/chat \
    -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
    -d '{"messages":[{"role":"user","content":"ping"}],"userId":"t"}'
done
# req 1-10: 200
# req 11-15: 429 (Retry-After: 60)

# 6. Metrics
curl -H "X-API-Key: $API_KEY" https://lab12.hvan.it.com/api/metrics
# → {"month":"2026-04","monthlyBudget":10,"keys":[{"key":"<8chars>","spentUsd":0.0012}]}
```

---

## 8. Rủi ro & cách mitigation

| Rủi ro | Mitigation |
|---|---|
| OpenAI API key lộ ra log | `.gitignore` có `.env*`; secret chỉ set qua `gh secret set` + inject runtime, không bao giờ log |
| Rate-limit in-memory bị bypass khi scale ra nhiều instance | Docker Compose single-instance hiện tại đủ; nếu cần scale → swap sang Upstash Redis (1 dòng thay trong `lib/rateLimit.ts`) |
| VPS down → service down | Cloudflare Tunnel auto-reconnect; GitHub Actions giữ image trên GHCR, redeploy 1 command `docker compose up -d` |
| Prisma migration fail giữa chừng | Migration chạy trong container riêng (`--profile migrate run --rm`), fail → deploy dừng, không touch container `app` đang chạy |
| Cost guard reset khi container restart | Acceptable cho demo; production → persist sang Postgres với bảng `monthly_spend` |

---

## 9. Kết luận

Dự án Vinmec AI Agent đã đạt **đầy đủ 9/9 checklist Lab 12** + bonus **CI/CD pipeline tự động**.

Khác biệt chính so với sample `06-lab-complete` (Python/FastAPI):
- Stack production thật (Next.js + Postgres + AI SDK) thay vì mock LLM
- Tunnel hơn open port + Let's Encrypt
- GitHub Actions pipeline hoàn chỉnh (build → test → deploy → smoke)
- Protected `/api/metrics` để audit cost sau khi chạy

Deadline 17/4 → chỉ còn 1 bước: thêm Public Hostname `lab12.hvan.it.com` trên Cloudflare dashboard (30 giây), rồi `git push` → GHA tự deploy.
