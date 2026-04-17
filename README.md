# Vinmec AI Agent — Lab 12 Submission

Trợ lý ảo VinmecCare: Next.js 14 + Prisma + Postgres + OpenAI gpt-4o-mini.
Production-ready với đầy đủ 9 yêu cầu Lab 12 (Dockerfile multi-stage, API key auth,
rate limit, cost guard, health/ready probes, graceful shutdown, stateless, env config,
public URL qua Cloudflare Tunnel).

**Live:** https://lab12.hvan.it.com
**Báo cáo Lab 12:** [`BAO_CAO_LAB12_VINMEC.md`](./BAO_CAO_LAB12_VINMEC.md)

---

## 🚀 Chạy local bằng Docker (1 phát)

```bash
git clone https://github.com/hvan128/Lab12_Vinmec_2A202600386.git
cd Lab12_Vinmec_2A202600386
cp .env.example .env
# Mở .env, điền OPENAI_API_KEY của bạn (bắt buộc)
# AGENT_API_KEY, POSTGRES_PASSWORD có thể để default hoặc sinh ngẫu nhiên

docker compose up --build
# ☝️ Build image từ Dockerfile (nếu GHCR image không public)
# Tự động: start postgres → chạy migrate + seed → start app
```

Mở trình duyệt: http://localhost:3003

- **UI chat:** chọn user (user-an / user-binh / user-cuong) → trò chuyện
- **API health:** http://localhost:3003/api/health → 200
- **API chat external:** cần header `X-API-Key: <AGENT_API_KEY từ .env>`

---

## 🧪 Test như grader

```bash
KEY=$(grep '^AGENT_API_KEY=' .env | cut -d= -f2)

# Không key → 401
curl -X POST http://localhost:3003/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[],"userId":"t"}'

# Có key → 200 streaming
curl -X POST http://localhost:3003/api/chat \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Xin chào"}],"userId":"user-an"}'

# Rate-limit: req 1-10 → 200, req 11+ → 429
for i in {1..12}; do
  curl -s -o /dev/null -w "req $i: %{http_code}\n" \
    -X POST http://localhost:3003/api/chat \
    -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"ping"}],"userId":"t"}'
done
```

---

## 🏗 Kiến trúc

```
Browser
   │
   ▼
Cloudflare Tunnel (HTTPS) ── only on VPS, profile "tunnel"
   │
   ▼
Next.js app :3000 (inside container, mapped :3003 on VPS)
   │
   ├─► POST /api/chat (API key auth + rate limit + cost guard)
   ├─► GET  /api/health (liveness)
   ├─► GET  /api/ready  (readiness — checks DB)
   └─► GET  /api/metrics (protected — cost snapshot)
       │
       ▼
   Prisma → Postgres (session + feedback + golden examples)
```

---

## 📦 CI/CD

Push `main` → GitHub Actions:
1. Build 2 Docker images (runtime + migrate) → push GHCR
2. SSH VPS (`root@157.66.100.59`), scp `docker-compose.yml`
3. Write `.env` with secrets from GitHub Secrets
4. `docker compose --profile tunnel up -d` — migrate auto-run, sau đó app start
5. Smoke test: curl `/api/health` + test 401 enforcement

Thời gian deploy full: ~5 phút.

---

## 🔧 Development (không Docker)

```bash
npm install
cp .env.example .env  # điền giá trị

# Chạy Postgres riêng (hoặc dùng `docker compose up db`)
# Rồi migrate + seed:
npx prisma migrate dev
npx prisma db seed

npm run dev
# → http://localhost:3000
```

---

## 📖 Docs

- [`BAO_CAO_LAB12_VINMEC.md`](./BAO_CAO_LAB12_VINMEC.md) — Mapping 9/9 yêu cầu Lab 12
- [`Day06-Hackathon-Assignment.pdf`](./Day06-Hackathon-Assignment.pdf) — Bài gốc
- [`bao-cao-ca-nhan.md`](./bao-cao-ca-nhan.md) — Báo cáo cá nhân Day 6
- [`golden-example-logic.md`](./golden-example-logic.md) — Flywheel logic

---

## 🔐 Security notes

- Demo `AGENT_API_KEY` public trong `DEPLOYMENT.md` của submission — rate-limit
  10 req/min + cost guard $0.5/tháng giới hạn thiệt hại nếu lộ.
- Sau lab deadline rotate: `gh secret set AGENT_API_KEY ...` → GHA tự redeploy.
- `.env` luôn ignored (xem `.gitignore`). Chỉ `.env.example` được commit.
