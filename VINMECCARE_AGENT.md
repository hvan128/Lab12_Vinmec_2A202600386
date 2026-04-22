# VinmecCare AI Agent — Tài liệu chi tiết

## Tổng quan

**VinmecCare** là trợ lý ảo AI dành cho hệ thống bệnh viện Vinmec (Việt Nam). Agent hỗ trợ bệnh nhân đặt lịch khám, tư vấn chuyên khoa theo triệu chứng, cung cấp thông tin bệnh viện — tất cả qua hội thoại tiếng Việt tự nhiên.

| Thông số | Giá trị |
|----------|---------|
| LLM | OpenAI `gpt-4o-mini` |
| Framework | Next.js 14 + TypeScript + Prisma 7 + PostgreSQL 16 |
| Triển khai | Docker Compose + Cloudflare Tunnel |
| Live URL | https://lab12.hvan.it.com |

---

## Khả năng của Agent (13 Tools)

### 1. `get_current_user` — Lấy hồ sơ bệnh nhân
Truy xuất thông tin người dùng đang đăng nhập (tên, tuổi, giới tính, ghi chú bệnh lý, lịch sử cuộc hẹn). Dùng để cá nhân hoá mọi phản hồi.

---

### 2. `recommend_department` — Gợi ý chuyên khoa theo triệu chứng
Ánh xạ triệu chứng → chuyên khoa bằng quy tắc cứng (không dùng LLM suy diễn, tránh hallucination). Trả về tối đa 3 chuyên khoa phù hợp nhất kèm điểm tương đồng.

| Triệu chứng | Chuyên khoa |
|-------------|-------------|
| Đau bụng, tiêu chảy, buồn nôn | Tiêu hoá |
| Đau ngực, hồi hộp, cao huyết áp | Tim mạch |
| Ho, sốt, viêm phế quản | Hô hấp |
| Đau lưng, đau khớp | Cơ xương khớp |
| Đau đầu, chóng mặt | Thần kinh |
| Bệnh nhân dưới 16 tuổi | Nhi khoa |
| Phụ nữ mang thai, vấn đề kinh nguyệt | Sản phụ khoa |
| Vấn đề về mắt | Nhãn khoa |
| Vấn đề răng miệng | Răng hàm mặt |
| Bệnh da liễu | Da liễu |

---

### 3. `list_doctors` — Danh sách bác sĩ theo chuyên khoa
Lấy toàn bộ bác sĩ thuộc một chuyên khoa: tên, học hàm, chuyên môn, kinh nghiệm (năm), tiểu sử.

---

### 4. `check_availability` — Kiểm tra lịch trống của bác sĩ
Tạo các khung giờ 2 tiếng trong khung làm việc **07:00–20:00 (GMT+7)** trong N ngày tới. Tự động loại trừ Chủ nhật và các slot đã đặt. Trả về tối đa 20 slot trống kèm giờ Việt Nam hiển thị.

> **Bắt buộc** phải gọi tool này trước khi đặt hoặc đổi lịch.

---

### 5. `book_appointment` — Đặt lịch hẹn
Tạo cuộc hẹn sau khi người dùng xác nhận slot trống. Xác thực: bác sĩ tồn tại, người dùng tồn tại, giờ hợp lệ, không trùng lịch. Trả về mã xác nhận 6 ký tự.

---

### 6. `reschedule_appointment` — Đổi lịch hẹn
Chuyển cuộc hẹn hiện có sang slot mới. Phải gọi `check_availability` trước và được người dùng xác nhận trước khi thực thi.

---

### 7. `cancel_appointment` — Huỷ lịch hẹn
Huỷ cuộc hẹn đã đặt/đã đổi, cập nhật trạng thái thành `cancelled`.

---

### 8. `get_user_appointments` — Xem lịch sử cuộc hẹn
Liệt kê các cuộc hẹn đã qua và sắp tới của người dùng (trạng thái, bác sĩ, chuyên khoa, giờ hẹn).

---

### 9. `get_preparation_guide` — Hướng dẫn chuẩn bị khám
Cung cấp chỉ dẫn trước khi đến khám theo loại xét nghiệm (nhịn ăn, thuốc đang dùng, v.v.). Ví dụ: Siêu âm, Xét nghiệm máu, CT Scan.

---

### 10. `search_hospital_faq` — Tìm kiếm FAQ bệnh viện
Truy vấn cơ sở dữ liệu câu hỏi thường gặp theo từ khoá. Trả về các cặp hỏi-đáp liên quan đến dịch vụ, chính sách, giờ làm việc.

---

### 11. `schedule_followup` — Đặt lịch tái khám
Đặt cuộc hẹn theo dõi sau khi kết thúc đợt khám, hỗ trợ quản lý bệnh mãn tính.

---

### 12. `find_nearest_branch` — Tìm chi nhánh Vinmec gần nhất
Tìm tối đa 3 chi nhánh gần nhất dựa trên tên thành phố hoặc toạ độ GPS. Tính khoảng cách theo công thức Haversine.

---

### 13. `save_feedback_note` — Lưu ghi chú phản hồi
Lưu ghi chú ngữ cảnh từ phản hồi người dùng để admin xem xét và cải thiện mô hình.

---

## Luồng hội thoại điển hình

```
Người dùng: "Tôi bị đau ngực và hồi hộp"
    ↓
Agent gọi get_current_user (lấy hồ sơ, kiểm tra tuổi/bệnh lý nền)
    ↓
Agent gọi recommend_department → Tim mạch (score cao nhất)
    ↓
Agent gọi list_doctors → Danh sách bác sĩ Tim mạch
    ↓
Người dùng chọn bác sĩ
    ↓
Agent gọi check_availability → Các slot trống trong 7 ngày tới
    ↓
Người dùng xác nhận slot
    ↓
Agent gọi book_appointment → Mã xác nhận: "AB12C3"
    ↓
Agent gọi get_preparation_guide → Hướng dẫn chuẩn bị khám Tim mạch
```

---

## API Endpoints

### Chat (Có bảo vệ)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/chat` | Gửi tin nhắn, nhận phản hồi stream (SSE) |

**Header yêu cầu:** `X-API-Key: <32-char hex>`  
**Body:** `{ messages: UIMessage[], userId: string }`

### Health & Readiness

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/health` | Liveness probe — process còn sống? |
| `GET` | `/api/ready` | Readiness probe — DB + OpenAI key OK? |
| `GET` | `/api/metrics` | Snapshot chi phí/token (cần API key) |

### Auth & User

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/auth/login` | Đăng nhập |
| `POST` | `/api/auth/register` | Đăng ký |
| `GET` | `/api/users` | Danh sách demo users |

### Feedback

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/feedback` | Lưu đánh giá thumbs up/down |

### Admin Flywheel (Cần `?key=ADMIN_KEY`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/admin/feedback` | Xem toàn bộ feedback (hỗ trợ export JSONL) |
| `GET` | `/api/admin/flywheel/golden` | Xem golden examples |
| `PATCH` | `/api/admin/flywheel/golden` | Bật/tắt golden example |
| `POST` | `/api/admin/flywheel/promote` | Chạy worker tự động promote |
| `GET` | `/api/admin/flywheel/trend` | Xu hướng quality score theo thời gian |

---

## Bảo mật & Giới hạn

### Xác thực
- **API Key:** Header `X-API-Key` (32-char hex) — bắt buộc cho request bên ngoài
- **UI bypass:** Request cùng origin (localhost, NEXT_PUBLIC_APP_URL) không cần API key
- **Admin:** Query param `?key=ADMIN_KEY` cho `/api/admin/*`

### Rate Limiting
- 10 request/phút mỗi API key (sliding window)
- Vượt giới hạn → HTTP 429 + header `Retry-After`

### Cost Guard
- Ngân sách tháng: **$0.50 USD** (cấu hình qua `MONTHLY_BUDGET_USD`)
- Tính dựa trên token gpt-4o-mini: $0.15/1M input, $0.60/1M output
- Vượt ngân sách → HTTP 402

### Hành vi an toàn của Agent
- **Không chẩn đoán bệnh, không kê đơn thuốc**
- Chỉ hỗ trợ lên lịch và tư vấn chuyên khoa
- Department recommendation dùng quy tắc cứng (không LLM)
- System prompt: "TUYỆT ĐỐI không cung cấp dữ liệu giả/mock/placeholder"
- Xác nhận đầy đủ thông tin trước khi đặt lịch

### Giờ làm việc
- **07:00 – 20:00 (GMT+7)**, trừ Chủ nhật
- Agent từ chối slot ngoài khung giờ này

---

## Hệ thống Data Flywheel

VinmecCare có vòng lặp tự cải thiện chất lượng:

```
Chat hoàn tất
    ↓
gpt-4o-mini chấm điểm async (5 tiêu chí, mỗi tiêu chí 1–5)
    ├── Gợi ý đúng chuyên khoa
    ├── Chuỗi tool đầy đủ
    ├── Giọng văn phù hợp
    ├── Cô đọng, không lan man
    └── Tuân thủ workflow (giờ, check_availability trước khi đặt)
    ↓
Nếu overall score ≥ 4.2 → tự động promote thành Golden Example
    ↓
Top 5 positive + 3 negative golden examples được inject vào system prompt
cho request tiếp theo (cache 60 giây)
    ↓
Admin có thể bật/tắt golden example thủ công
    ↓
Export JSONL để fine-tune model trong tương lai
```

---

## Cấu hình môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `OPENAI_API_KEY` | *(bắt buộc)* | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model LLM |
| `AGENT_API_KEY` | `dev-key-change-me-in-production` | API key bảo vệ `/api/chat` |
| `ADMIN_KEY` | `vinmec-demo-2026` | Key admin endpoints |
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/vinmec_ai` | Kết nối DB |
| `RATE_LIMIT_PER_MINUTE` | `10` | Giới hạn request/phút |
| `MONTHLY_BUDGET_USD` | `0.5` | Ngân sách hàng tháng |
| `REQUIRE_AUTH` | `true` | Bật/tắt xác thực API key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3003` | Origin UI |

---

## Chạy local

```bash
# Khởi động toàn bộ stack (DB + migrate + app)
docker compose up --build

# App chạy tại http://localhost:3003
# Demo users: user-an, user-binh, user-cuong (pass: password123)

# Gọi API từ ngoài
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-change-me-in-production" \
  -d '{"messages":[{"role":"user","content":"Tôi bị đau đầu"}],"userId":"user-an"}'
```

---

## Cấu trúc file quan trọng

```
app/api/chat/route.ts          — Chat endpoint (auth + rate limit + cost guard)
lib/agent/tools/               — 13 tool implementations
lib/agent/system-prompt.ts     — System prompt + golden example injection
lib/agent/judge.ts             — Async quality scoring
lib/agent/golden-loader.ts     — Golden example cache
lib/auth.ts                    — API key verification
lib/rateLimit.ts               — Sliding window rate limiter
lib/costGuard.ts               — Token spend tracking
prisma/schema.prisma           — Database schema (9 models)
docker-compose.yml             — Production stack
Dockerfile                     — Multi-stage build (deps → builder → runtime)
```
