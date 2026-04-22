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

## Kịch bản người dùng hay gặp

### Nhóm 1 — Tư vấn triệu chứng & chọn chuyên khoa

---

**Kịch bản 1.1 — Triệu chứng rõ ràng, đặt lịch thành công**

> *User:* Dạo này mình hay bị đau ngực, hồi hộp, khó thở. Mình nên khám khoa nào?

> *Agent:* Dựa trên triệu chứng của bạn, mình gợi ý **khoa Tim mạch**. Triệu chứng đau ngực kết hợp hồi hộp, khó thở cần được kiểm tra sớm. Bạn có muốn mình tìm bác sĩ và đặt lịch ngay không?

> *User:* Có, mình muốn đặt lịch.

> *Agent:* [Gọi `list_doctors`] Khoa Tim mạch có 3 bác sĩ: BS. Nguyễn Văn A (15 năm KN), BS. Trần Thị B (12 năm KN), BS. Lê Văn C (8 năm KN). Bạn muốn gặp bác sĩ nào?

> *User:* BS. Nguyễn Văn A.

> *Agent:* [Gọi `check_availability`] Bác sĩ Nguyễn Văn A có các slot trống: Thứ Hai 28/04 lúc 09:00, 14:00; Thứ Ba 29/04 lúc 08:00, 11:00... Bạn chọn giờ nào?

> *User:* Thứ Hai 9h sáng.

> *Agent:* Xác nhận đặt lịch: **BS. Nguyễn Văn A — Tim mạch — 09:00 Thứ Hai 28/04**. Đúng không ạ?

> *User:* Đúng rồi.

> *Agent:* [Gọi `book_appointment`] Đặt lịch thành công! Mã xác nhận: **TM4R2K**. [Gọi `get_preparation_guide`] Trước khi đến khám Tim mạch, bạn lưu ý: nhịn ăn 4 tiếng nếu có xét nghiệm máu, mang theo các kết quả khám cũ (nếu có), mặc trang phục thoải mái.

**Tools được gọi:** `get_current_user` → `recommend_department` → `list_doctors` → `check_availability` → `book_appointment` → `get_preparation_guide`

---

**Kịch bản 1.2 — Triệu chứng mơ hồ, agent hỏi thêm**

> *User:* Tôi thấy người không khoẻ.

> *Agent:* Bạn có thể mô tả rõ hơn không ạ? Ví dụ: bạn bị đau ở đâu, có sốt không, cảm giác như thế nào?

> *User:* Mệt mỏi, chóng mặt, ăn không ngon.

> *Agent:* [Gọi `recommend_department`] Triệu chứng chóng mặt kết hợp mệt mỏi, ăn uống kém có thể liên quan đến **Thần kinh** hoặc **Nội tổng quát**. Bạn bao nhiêu tuổi ạ? (để mình gợi ý phù hợp hơn)

> *User:* 65 tuổi.

> *Agent:* Với tuổi 65 và triệu chứng chóng mặt, mình ưu tiên gợi ý **khoa Thần kinh** để kiểm tra huyết áp não và tiền đình. Bạn có muốn đặt lịch không?

---

**Kịch bản 1.3 — Trẻ em dưới 16 tuổi**

> *User:* Con tôi 8 tuổi bị sốt cao và ho liên tục đã 3 ngày.

> *Agent:* [Gọi `recommend_department`] Vì cháu dưới 16 tuổi, mình gợi ý khám tại **khoa Nhi**. Sốt kéo dài 3 ngày kết hợp ho cần được thăm khám sớm. Bạn muốn đặt lịch khoa Nhi không ạ?

---

### Nhóm 2 — Quản lý lịch hẹn

---

**Kịch bản 2.1 — Xem lịch hẹn đã đặt**

> *User:* Cho tôi xem các lịch hẹn của tôi.

> *Agent:* [Gọi `get_user_appointments`] Bạn có 2 cuộc hẹn sắp tới:
> - **Thứ Hai 28/04 lúc 09:00** — BS. Nguyễn Văn A (Tim mạch) — Trạng thái: Đã đặt
> - **Thứ Sáu 02/05 lúc 14:00** — BS. Trần Thị B (Da liễu) — Trạng thái: Đã đặt

---

**Kịch bản 2.2 — Đổi lịch hẹn**

> *User:* Tôi muốn đổi lịch hẹn ngày Thứ Hai với BS. Nguyễn Văn A sang ngày khác.

> *Agent:* [Gọi `check_availability`] Bác sĩ Nguyễn Văn A còn trống: Thứ Tư 30/04 lúc 10:00, 15:00; Thứ Năm 01/05 lúc 08:00... Bạn muốn chuyển sang giờ nào?

> *User:* Thứ Tư 10h.

> *Agent:* Xác nhận đổi lịch: từ **Thứ Hai 28/04 09:00** sang **Thứ Tư 30/04 10:00** với BS. Nguyễn Văn A. Đúng không ạ?

> *User:* Đúng.

> *Agent:* [Gọi `reschedule_appointment`] Đổi lịch thành công! Mã xác nhận mới: **TM7X9Q**.

**Lưu ý:** Agent bắt buộc phải gọi `check_availability` trước, không được đổi lịch mà không xác nhận slot trống.

---

**Kịch bản 2.3 — Huỷ lịch hẹn**

> *User:* Tôi muốn huỷ lịch ngày Thứ Sáu với BS. Trần Thị B.

> *Agent:* Bạn chắc chắn muốn huỷ cuộc hẹn **Thứ Sáu 02/05 lúc 14:00** với BS. Trần Thị B (Da liễu) không ạ?

> *User:* Có.

> *Agent:* [Gọi `cancel_appointment`] Đã huỷ lịch thành công. Nếu bạn muốn đặt lại lịch sau, mình luôn sẵn sàng hỗ trợ.

---

**Kịch bản 2.4 — Đặt lịch ngoài giờ làm việc (bị từ chối)**

> *User:* Cho tôi đặt lịch lúc 9 giờ tối.

> *Agent:* Giờ làm việc của Vinmec là **07:00 – 20:00**, nên mình không thể đặt lịch lúc 21:00. Bạn có muốn chọn giờ trong khung 07:00–20:00 không ạ?

---

**Kịch bản 2.5 — Đặt lịch tái khám**

> *User:* Bác sĩ dặn tôi tái khám sau 2 tuần. Mình đặt lịch tái khám được không?

> *Agent:* [Gọi `get_user_appointments`] Mình thấy bạn vừa khám Tim mạch với BS. Nguyễn Văn A. Bạn muốn đặt tái khám với bác sĩ đó không, hay đổi bác sĩ?

> *User:* Vẫn BS. đó.

> *Agent:* [Gọi `check_availability`] [Gọi `schedule_followup`] Đã đặt lịch tái khám **Thứ Hai 12/05 lúc 09:00** với BS. Nguyễn Văn A. Mã: **TK8B1M**.

---

### Nhóm 3 — Thông tin bệnh viện & dịch vụ

---

**Kịch bản 3.1 — Giờ làm việc, chính sách**

> *User:* Vinmec có làm việc vào Chủ nhật không?

> *Agent:* [Gọi `search_hospital_faq`] Vinmec không nhận đặt lịch hẹn vào Chủ nhật. Các ngày làm việc từ **Thứ Hai đến Thứ Bảy**, khung giờ **07:00 – 20:00**. Trường hợp khẩn cấp, bạn có thể đến cấp cứu 24/7.

---

**Kịch bản 3.2 — Tìm chi nhánh gần nhất**

> *User:* Bệnh viện Vinmec gần quận Cầu Giấy, Hà Nội nhất ở đâu?

> *Agent:* [Gọi `find_nearest_branch`] Chi nhánh gần nhất khu vực Cầu Giấy là:
> 1. **Vinmec Times City** — 458 Minh Khai, Hai Bà Trưng (~4.2 km) — 024 3974 3556
> 2. **Vinmec Royal City** — 72A Nguyễn Trãi, Thanh Xuân (~5.1 km) — 024 3974 3556
> 3. **Vinmec Mễ Trì** — 458 Minh Khai (~6.8 km)

---

**Kịch bản 3.3 — Hướng dẫn chuẩn bị xét nghiệm**

> *User:* Mai tôi có lịch xét nghiệm máu, cần chuẩn bị gì không?

> *Agent:* [Gọi `get_preparation_guide`] Để xét nghiệm máu cho kết quả chính xác:
> - **Nhịn ăn tối thiểu 8 tiếng** trước khi xét nghiệm (uống nước lọc được)
> - Không uống rượu bia 24 giờ trước
> - Mang theo CCCD/BHYT
> - Đến trước giờ hẹn 15 phút để làm thủ tục

---

**Kịch bản 3.4 — Câu hỏi về bảo hiểm y tế**

> *User:* Khám tại Vinmec có dùng bảo hiểm y tế được không?

> *Agent:* [Gọi `search_hospital_faq`] Vinmec có ký hợp đồng khám chữa bệnh bảo hiểm y tế. Tuy nhiên phạm vi áp dụng tùy từng gói dịch vụ và loại thẻ BHYT. Bạn vui lòng mang thẻ BHYT đến quầy lễ tân để được kiểm tra cụ thể.

---

### Nhóm 4 — Trường hợp đặc biệt & biên giới hệ thống

---

**Kịch bản 4.1 — Yêu cầu chẩn đoán bệnh (bị từ chối an toàn)**

> *User:* Nhìn vào triệu chứng của tôi, bạn nghĩ tôi bị bệnh gì?

> *Agent:* Mình là trợ lý đặt lịch khám, không có chức năng chẩn đoán bệnh. Việc chẩn đoán chính xác cần được thực hiện bởi bác sĩ sau khi thăm khám trực tiếp. Mình có thể giúp bạn **tìm đúng chuyên khoa** và **đặt lịch gặp bác sĩ** ngay hôm nay nhé?

---

**Kịch bản 4.2 — Yêu cầu kê đơn thuốc (bị từ chối an toàn)**

> *User:* Tôi bị đau đầu, cho tôi biết uống thuốc gì?

> *Agent:* Mình không thể tư vấn hay kê đơn thuốc vì điều này cần bác sĩ thăm khám trực tiếp. Dùng thuốc sai có thể gây nguy hiểm. Mình gợi ý bạn đặt lịch gặp **khoa Thần kinh** hoặc **Nội tổng quát** để được tư vấn đúng cách nhé?

---

**Kịch bản 4.3 — Trùng lịch (conflict prevention)**

> *User:* Đặt cho tôi lịch Thứ Hai 09:00 với BS. Nguyễn Văn A.

> *Agent:* [Gọi `check_availability`] Slot Thứ Hai 09:00 với BS. Nguyễn Văn A đã được đặt. Các slot còn trống: 11:00, 14:00, 16:00. Bạn chọn giờ khác không ạ?

---

**Kịch bản 4.4 — Người dùng cung cấp toạ độ GPS**

> *User:* Tôi đang ở toạ độ 10.7769° N, 106.7009° E. Vinmec nào gần tôi nhất?

> *Agent:* [Gọi `find_nearest_branch` với lat/lng] Dựa trên vị trí của bạn (khu vực TP.HCM), chi nhánh gần nhất là:
> 1. **Vinmec Central Park** — 208 Nguyễn Hữu Cảnh, Bình Thạnh (~1.8 km)
> 2. **Vinmec Landmark 81** — 772 Điện Biên Phủ (~3.2 km)

---

**Kịch bản 4.5 — Người dùng mô tả giờ theo dân gian Việt Nam**

> *User:* Tôi muốn đặt lúc 4 giờ chiều Thứ Tư.

> *Agent:* [Hiểu "4h chiều" = 16:00] Xác nhận: **Thứ Tư 30/04 lúc 16:00**. Đúng không ạ?

> *User:* Đặt lúc 8 giờ tối được không?

> *Agent:* Giờ 20:00 là giờ đóng cửa, nên mình không thể đặt lịch lúc đó. Khung giờ cuối trong ngày là **19:00**. Bạn có muốn chọn 19:00 không ạ?

---

**Kịch bản 4.6 — Người dùng mới, chưa đăng nhập**

> *User:* (chưa đăng nhập) Tôi muốn đặt lịch khám.

> *Agent:* Để đặt lịch, bạn cần đăng nhập tài khoản trước. Bạn có thể đăng nhập tại trang `/login`. Nếu chưa có tài khoản, hãy đăng ký để mình hỗ trợ tốt hơn.

---

### Nhóm 5 — Hội thoại nhiều lượt & ngữ cảnh phức tạp

---

**Kịch bản 5.1 — Bệnh mãn tính, cần tái khám định kỳ**

> *User:* Tôi bị tiểu đường type 2, cần theo dõi định kỳ hàng tháng.

> *Agent:* [Gọi `recommend_department`] Với bệnh tiểu đường type 2, bạn cần theo dõi tại **khoa Nội tiết** hoặc **Nội tổng quát**. Mình có thể đặt lịch tháng này và nhắc nhở bạn đặt tháng sau. Bạn muốn bắt đầu không?

---

**Kịch bản 5.2 — Người dùng muốn đổi bác sĩ**

> *User:* Tôi muốn gặp bác sĩ khác trong khoa Tim mạch, không phải BS. Nguyễn Văn A.

> *Agent:* [Gọi `list_doctors`] Khoa Tim mạch còn có: **BS. Trần Thị B** (12 năm KN, chuyên can thiệp mạch vành) và **BS. Lê Văn C** (8 năm KN, chuyên siêu âm tim). Bạn muốn gặp ai?

---

**Kịch bản 5.3 — Phụ huynh đặt lịch cho con**

> *User:* Tôi muốn đặt lịch cho con gái tôi 5 tuổi, bé bị phát ban đỏ toàn thân.

> *Agent:* [Gọi `recommend_department`] Vì bé dưới 16 tuổi, mình gợi ý khám **khoa Nhi** (kết hợp Da liễu Nhi nếu cần). Phát ban đỏ toàn thân cần được khám sớm. Bạn muốn đặt lịch khoa Nhi không ạ?

---

### Nhóm 6 — Cá nhân hoá theo hồ sơ bệnh nhân

---

**Kịch bản 6.1 — Bệnh lý nền ảnh hưởng gợi ý chuyên khoa**

> *User:* Tôi bị đau đầu nhẹ.

> *Agent:* [Gọi `get_current_user` → phát hiện hồ sơ ghi "tiền sử cao huyết áp"] Mình thấy trong hồ sơ của bạn có ghi tiền sử cao huyết áp. Với triệu chứng đau đầu, mình gợi ý ưu tiên kiểm tra tại **khoa Tim mạch** hoặc **Thần kinh** thay vì chỉ dùng thuốc giảm đau thông thường. Bạn muốn đặt lịch không?

---

**Kịch bản 6.2 — Người cao tuổi, agent hỏi từng bước**

> *User:* Tôi muốn đặt lịch khám (user 72 tuổi trong hồ sơ).

> *Agent:* [Gọi `get_current_user`] Chào bác! Bác đang có triệu chứng gì để mình giúp tìm đúng chuyên khoa ạ?

> *User:* Tôi đau lưng.

> *Agent:* Bác bị đau ở vùng nào của lưng — lưng trên hay lưng dưới ạ? Và đau lâu chưa?

*(Agent hỏi từng câu một, không dồn nhiều câu hỏi cùng lúc — quy tắc trong system prompt)*

---

**Kịch bản 6.3 — Phụ nữ mang thai**

> *User:* Tôi đang mang thai 20 tuần, bị phù chân và đau lưng.

> *Agent:* [Gọi `recommend_department` → phát hiện từ khoá "mang thai"] Với phụ nữ mang thai, mình gợi ý khám tại **khoa Sản phụ khoa**. Phù chân và đau lưng ở tuần 20 cần được theo dõi bởi bác sĩ sản. Bạn có muốn đặt lịch không?

---

### Nhóm 7 — Lỗi & giới hạn hệ thống

---

**Kịch bản 7.1 — Bác sĩ không còn slot nào**

> *User:* Đặt lịch với BS. Nguyễn Văn A tuần này.

> *Agent:* [Gọi `check_availability` → kết quả rỗng] BS. Nguyễn Văn A hiện không còn slot trống trong 7 ngày tới. Bạn có muốn:
> - Xem bác sĩ khác trong khoa Tim mạch, hoặc
> - Mình kiểm tra lịch trống tuần sau?

---

**Kịch bản 7.2 — Rate limit bị chạm (HTTP 429)**

> *(User gửi >10 request trong 1 phút)*

> *Hệ thống trả về:* `429 Too Many Requests` — `Retry-After: 47`

> *Agent:* Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng chờ khoảng **47 giây** rồi thử lại nhé.

---

**Kịch bản 7.3 — Ngân sách tháng vượt giới hạn (HTTP 402)**

> *(Hệ thống đã tiêu hết $0.50/tháng)*

> *Hệ thống trả về:* `402 Payment Required`

> *Agent:* Hệ thống tạm thời không khả dụng do giới hạn ngân sách tháng. Vui lòng liên hệ quản trị viên hoặc thử lại vào tháng sau.

---

**Kịch bản 7.4 — Database không sẵn sàng (Readiness probe)**

> `GET /api/ready` → `503 Service Unavailable`

```json
{
  "ready": false,
  "checks": {
    "database": "error: Connection refused",
    "openai_key": "ok"
  }
}
```

> *Hành vi:* Load balancer ngừng chuyển traffic đến instance này cho đến khi DB phục hồi.

---

**Kịch bản 7.5 — API Key sai hoặc thiếu (HTTP 401)**

> *(Request từ bên ngoài không có header `X-API-Key`)*

> *Hệ thống trả về:* `401 Unauthorized`

```json
{ "error": "Missing or invalid API key" }
```

---

**Kịch bản 7.6 — Hai người dùng tranh nhau cùng một slot**

> *(User A và User B đều đang xem slot Thứ Hai 09:00 với BS. Nguyễn Văn A)*

> *User A đặt trước* → thành công.

> *User B đặt sau* → [Gọi `book_appointment` → DB constraint violation]

> *Agent với User B:* Rất tiếc, slot **Thứ Hai 09:00** vừa được đặt bởi bệnh nhân khác. Các slot còn lại: 11:00, 14:00. Bạn chọn giờ khác không ạ?

---

### Nhóm 8 — Phản hồi & cải thiện chất lượng

---

**Kịch bản 8.1 — User đánh giá thumbs down**

> *(User nhấn 👎 sau khi nhận câu trả lời)*

> *Agent:* Cảm ơn bạn đã phản hồi! Bạn có thể cho mình biết câu trả lời chưa đúng ở điểm nào không? (Ví dụ: chuyên khoa gợi ý không phù hợp, thông tin sai, giờ không đúng...)

> *[Hệ thống lưu feedback vào DB, judge scoring chạy async, nếu score thấp → lưu làm negative golden example]*

---

**Kịch bản 8.2 — User đánh giá thumbs up**

> *(User nhấn 👍)*

> *[Hệ thống lưu feedback, judge scoring chạy async, nếu score ≥ 4.2 → tự động promote thành positive golden example, inject vào system prompt cho request tiếp theo]*

---

**Kịch bản 8.3 — Admin xem xu hướng chất lượng**

> `GET /api/admin/flywheel/trend?key=vinmec-demo-2026`

```json
{
  "avgScore": 4.1,
  "trend": "improving",
  "totalScored": 142,
  "goldenExamples": { "positive": 18, "negative": 5 }
}
```

---

### Nhóm 9 — Câu hỏi về bác sĩ & dịch vụ cụ thể

---

**Kịch bản 9.1 — Hỏi thông tin bác sĩ trước khi chọn**

> *User:* BS. Nguyễn Văn A có kinh nghiệm gì không? Tôi muốn biết trước khi đặt.

> *Agent:* [Gọi `list_doctors`] BS. Nguyễn Văn A — Tiến sĩ Y khoa, **15 năm kinh nghiệm** tim mạch can thiệp, chuyên về đặt stent và điều trị rối loạn nhịp. Từng công tác tại Viện Tim mạch Quốc gia. Bạn có muốn đặt lịch với bác sĩ này không?

---

**Kịch bản 9.2 — Hỏi giá dịch vụ**

> *User:* Khám Tim mạch tốn bao nhiêu tiền?

> *Agent:* [Gọi `search_hospital_faq`] Giá khám Tim mạch tại Vinmec dao động từ **300.000 – 500.000 VNĐ** tuỳ gói dịch vụ và chỉ định của bác sĩ. Các xét nghiệm bổ sung (điện tâm đồ, siêu âm tim...) sẽ tính thêm. Bạn có thể dùng BHYT để giảm chi phí nếu có thẻ hợp lệ.

---

**Kịch bản 9.3 — Hỏi về dịch vụ không có trong FAQ**

> *User:* Vinmec có dịch vụ khám sức khoẻ tổng quát cho doanh nghiệp không?

> *Agent:* [Gọi `search_hospital_faq` → không tìm thấy kết quả khớp] Mình chưa có thông tin chi tiết về gói khám doanh nghiệp trong cơ sở dữ liệu. Bạn vui lòng liên hệ trực tiếp hotline Vinmec để được tư vấn cụ thể. Mình có thể giúp bạn tìm số điện thoại chi nhánh gần nhất không?

---

### Nhóm 10 — Hội thoại nhiều phiên, ngữ cảnh dài

---

**Kịch bản 10.1 — User quay lại sau khi đã khám**

> *User:* Tuần trước tôi khám Tim mạch, bác sĩ bảo tôi đo huyết áp theo dõi 2 tuần rồi tái khám.

> *Agent:* [Gọi `get_user_appointments` → thấy lịch khám Tim mạch 2 tuần trước] Mình thấy bạn đã khám với BS. Nguyễn Văn A ngày 08/04. Vậy bây giờ đã đủ 2 tuần, bạn muốn mình đặt lịch tái khám không?

---

**Kịch bản 10.2 — Đặt nhiều lịch trong một cuộc trò chuyện**

> *User:* Tôi muốn đặt lịch cho cả tôi (Tim mạch) và mẹ tôi (Nội tiết) luôn.

> *Agent:* Để đặt lịch cho mẹ bạn, mẹ cần có tài khoản riêng trên hệ thống. Hiện tại mình chỉ có thể đặt lịch cho tài khoản đang đăng nhập. Mình đặt lịch Tim mạch cho bạn trước nhé, sau đó bạn đăng nhập tài khoản của mẹ để đặt tiếp.

---

**Kịch bản 10.3 — User thay đổi ý giữa chừng**

> *User:* Đặt lịch Thứ Hai 9h với BS. Nguyễn Văn A.

> *Agent:* Xác nhận: **Thứ Hai 28/04 lúc 09:00** với BS. Nguyễn Văn A (Tim mạch). Đúng không ạ?

> *User:* Thôi, đổi sang Thứ Ba đi.

> *Agent:* [Gọi lại `check_availability`] Thứ Ba 29/04 BS. Nguyễn Văn A còn trống: 08:00, 11:00, 14:00. Bạn chọn giờ nào ạ?

---

## Tóm tắt — Bảng phân loại kịch bản

| Nhóm | Kịch bản | Tools chính |
|------|----------|-------------|
| **1** Triệu chứng | Gợi ý chuyên khoa từ triệu chứng rõ/mơ hồ, trẻ em | `recommend_department`, `get_current_user` |
| **2** Đặt lịch | Đặt mới, đổi, huỷ, ngoài giờ, tái khám | `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `schedule_followup` |
| **3** Thông tin | Giờ làm, BHYT, chuẩn bị khám, chi nhánh | `search_hospital_faq`, `get_preparation_guide`, `find_nearest_branch` |
| **4** Biên giới | Từ chối chẩn đoán/kê thuốc, giờ sai, trùng lịch, GPS | *(phản hồi an toàn, không gọi tool)* |
| **5** Đa lượt | Bệnh mãn tính, đổi bác sĩ, phụ huynh đặt cho con | Kết hợp nhiều tools |
| **6** Cá nhân hoá | Bệnh lý nền, cao tuổi, phụ nữ mang thai | `get_current_user`, `recommend_department` |
| **7** Lỗi hệ thống | Hết slot, rate limit 429, budget 402, auth 401, race condition | *(xử lý ở tầng middleware)* |
| **8** Chất lượng | Feedback thumbs up/down, judge scoring, admin trend | `save_feedback_note` + flywheel async |
| **9** Dịch vụ | Thông tin bác sĩ, giá, dịch vụ không có trong FAQ | `list_doctors`, `search_hospital_faq` |
| **10** Đa phiên | Tái khám sau điều trị, đặt nhiều lịch, thay đổi giữa chừng | `get_user_appointments`, `check_availability` |

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
