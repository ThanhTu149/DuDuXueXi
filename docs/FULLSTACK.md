# Kiến trúc Full-Stack — DuDu Hán Ngữ v2.0

Tài liệu mô tả tầng máy chủ Node.js + SQLite và cơ chế đồng bộ offline-first của DuDu Hán Ngữ.

## 1. Tổng quan kiến trúc

- **Frontend (Offline-First PWA)**: React 18 + Vite + Tailwind CSS + Service Worker (`/sw.js`) + IndexedDB v3 + `localStorage` an toàn. Người học vẫn học, ôn SRS và làm quiz bình thường khi mất mạng hoặc chạy bản tĩnh không kèm backend.
- **Backend (`server/`)**: Node.js ESM sử dụng `node:http`, `node:crypto` và **`node:sqlite` (`DatabaseSync`)** tích hợp sẵn (Node >= 22.5, không cần build C++ native).
  - Trong chế độ `npm run dev`: khởi chạy đồng thời API server (`http://127.0.0.1:3001`) và Vite dev server (`http://127.0.0.1:5173`) với proxy `/api/*`.
  - Trong chế độ `npm run build && npm start`: một máy chủ duy nhất phục vụ cả REST API `/api/*` lẫn ứng dụng tĩnh `dist/` với SPA fallback và chính sách `Cache-Control` phù hợp.

## 2. Cơ sở dữ liệu SQLite (`server/db/migrations.js`)

Tự động tạo thư mục, bật `WAL`, `foreign_keys = ON`, `busy_timeout = 5000` và chạy migration có phiên bản (`schema_migrations`):

| Bảng | Mục đích |
| --- | --- |
| `users` | Tài khoản học viên (`scrypt` + salt 16 byte), hồ sơ hiển thị, tuỳ chọn ẩn/hiện bảng xếp hạng |
| `sessions` | Phiên đăng nhập đa thiết bị (chỉ lưu SHA-256 hash của token, cookie `HttpOnly; SameSite=Lax`) |
| `user_settings` | Cài đặt giao diện, khóa học đang mở, model Gemini và **Gemini API key mã hoá AES-256-GCM** |
| `courses` | Khóa học tự tạo của người dùng và khóa học chia sẻ công khai (`is_public`, `share_code`, `tags_json`, `clone_count`) |
| `raw_documents` | Tài liệu trích xuất & checkpoint sinh bài học AI gắn với khóa học |
| `user_progress` | Tiến độ học từng khóa học (`xp`, `streak`, `accuracy`, `weekly_xp_json`, JSON đầy đủ, `version`) |
| `study_events` | Nhật ký sự kiện học tập (quiz, boss, SRS, Pomodoro, tải khóa học cộng đồng) |
| `tutor_messages` | Lịch sử hội thoại bền vững với **Gia sư Trúc AI** |

Khi khởi tạo lần đầu, `server/db/seed.js` nạp sẵn 2 khóa học cộng đồng mẫu chính thức (`HSK 1 — Giao tiếp hằng ngày` và `Du lịch & Ẩm thực Trung Hoa`) để người học có thể xem trước và nhân bản ngay.

## 3. REST API Endpoints

### Xác thực & Phiên (`/api/auth/*`)
- `GET /api/auth/me` — Kiểm tra phiên đăng nhập & trạng thái AI proxy (luôn trả `200`, không gây lỗi console 401 cho khách)
- `POST /api/auth/register` — Đăng ký tài khoản mới
- `POST /api/auth/login` — Đăng nhập bằng tên đăng nhập hoặc email
- `POST /api/auth/logout` — Đăng xuất phiên hiện tại
- `PATCH /api/auth/profile` — Cập nhật tên hiển thị, mô tả, ẩn/hiện bảng xếp hạng
- `POST /api/auth/password` — Đổi mật khẩu và tự động thu hồi các phiên thiết bị khác
- `GET /api/auth/sessions` / `DELETE /api/auth/sessions/:id` — Xem và thu hồi từng thiết bị đang đăng nhập
- `GET /api/auth/export` — Xuất toàn bộ dữ liệu tài khoản đám mây dạng JSON (không gồm mật khẩu hay key)
- `DELETE /api/auth/account` — Xoá vĩnh viễn tài khoản & toàn bộ dữ liệu liên quan (cần xác nhận mật khẩu)

### Đồng bộ đám mây & Thống kê (`/api/sync/*`, `/api/progress/*`, `/api/events`, `/api/analytics`)
- `GET /api/sync/bootstrap` — Tải toàn bộ cài đặt, khóa học, tiến độ và thống kê trong 1 request
- `GET /api/progress/:courseId` & `PUT /api/progress/:courseId` — Gộp tiến độ hai chiều an toàn (giữ thành tích, bookmark, SRS, bài đã mở khóa và XP cao hơn giữa các thiết bị)
- `POST /api/events` & `GET /api/analytics` — Ghi nhận và tổng hợp hoạt động học tập

### Khóa học & Kho cộng đồng (`/api/courses/*`, `/api/community/*`)
- `GET /api/courses`, `GET /api/courses/:id`, `PUT /api/courses/:id`, `DELETE /api/courses/:id` — CRUD khóa học có kiểm soát quyền sở hữu chặt chẽ
- `GET /api/courses/:id/raw-document`, `PUT /api/courses/:id/raw-document` — Đồng bộ tài liệu gốc và checkpoint AI
- `POST /api/courses/:id/publish` — Chia sẻ hoặc ẩn khóa học lên Kho cộng đồng kèm mã chia sẻ và thẻ chủ đề
- `GET /api/community/courses?q=&tag=&sort=popular|newest` — Duyệt và tìm kiếm khóa học cộng đồng
- `GET /api/community/courses/:id` — Xem trước cấu trúc bài học và từ vựng mẫu
- `POST /api/community/courses/:id/clone` — Nhân bản khóa học về thư viện cá nhân (tăng `clone_count`)

### Bảng xếp hạng (`/api/leaderboard`)
- `GET /api/leaderboard?period=week|all&limit=20` — Xếp hạng học viên theo XP tuần hiện tại (ISO week) hoặc tổng XP mọi thời đại, tôn trọng quyền riêng tư `showOnLeaderboard`.

### Cài đặt & Proxy AI Gemini (`/api/settings/*`, `/api/ai/*`)
- `GET /api/settings`, `PUT /api/settings` — Đồng bộ cài đặt giao diện và model Gemini
- `PUT /api/settings/gemini-key`, `DELETE /api/settings/gemini-key` — Lưu/xoá API key Gemini mã hoá AES-256-GCM (không bao giờ trả key thô về client)
- `GET /api/ai/status`, `GET /api/ai/models`, `POST /api/ai/test`, `POST /api/ai/generate` — Proxy gọi Gemini phía server (ưu tiên key mã hoá của người dùng hoặc `GEMINI_API_KEY` của server)
- `GET /api/ai/tutor/history`, `POST /api/ai/tutor`, `DELETE /api/ai/tutor/history` — Gia sư Trúc AI có nhận biết ngữ cảnh bài đang học

### Sức khoẻ hệ thống
- `GET /api/health` — Kiểm tra uptime, phiên bản schema SQLite và thống kê cơ bản.

## 4. Cơ chế đồng bộ Offline-First (`src/lib/cloudSync.js`)

1. Mọi thao tác học vẫn ghi tức thời vào `localStorage` + IndexedDB như trước.
2. Khi người dùng đăng nhập (hoặc mới tạo tài khoản), dữ liệu đã học trước đó ở chế độ khách được **tự động gộp và đẩy lên SQLite**, không mất tiến độ cũ.
3. Khi đang đăng nhập mà mất mạng, các thay đổi được ghi vào hàng đợi `dudu-cloud-pending-v1` và tự động đồng bộ lại ngay khi trình duyệt có mạng (`online` event) hoặc khi bấm **Đồng bộ ngay**.
4. **Cô lập máy dùng chung (`dudu-cloud-owner-v1`)**: nếu tài khoản B đăng nhập trên trình duyệt vừa dùng bởi tài khoản A, ứng dụng tự động xoá sạch bộ nhớ cục bộ của A trước khi nạp dữ liệu của B — không trộn lẫn tiến độ, khóa học hay API key. Có thêm nút **Đăng xuất & xoá máy này** cho máy công cộng.

## 5. Bảo mật, Hiệu năng & Triển khai Production (Audit v2.1)

- **Chống CSRF**: mọi request thay đổi dữ liệu (`POST/PUT/PATCH/DELETE`) dùng cookie được kiểm tra Fetch Metadata (`Sec-Fetch-Site`) và `Origin`/`Referer` trùng `Host` hoặc `CORS_ORIGIN`.
- **Security Headers**: `Content-Security-Policy`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, và `Strict-Transport-Security` khi bật HTTPS (`COOKIE_SECURE=true`).
- **Rate Limiting chống bypass**: mặc định dùng IP socket thật (chỉ tin `X-Forwarded-For` khi `TRUST_PROXY=true`), kết hợp giới hạn theo IP + theo tài khoản mục tiêu khi đăng nhập, giới hạn AI proxy, giới hạn clone cộng đồng và giới hạn tổng `/api/*`.
- **Chống Slowloris & giới hạn dung lượng**: `headersTimeout = 15s`, `requestTimeout = 70s`, `keepAliveTimeout = 5s`, giới hạn tối đa `MAX_COURSES_PER_USER` khóa học/user, kiểm tra nghiêm ngặt tên model Gemini (`^[a-z0-9._-]+$`).
- **Hiệu năng SQL & HTTP**:
  - Schema v2 lưu sẵn `chapter_count`, `total_entries`, `total_questions` và `current_week_key`/`current_week_xp`; các endpoint liệt kê khóa học không đọc `chapters_json`, bảng xếp hạng gom nhóm trực tiếp bằng SQLite `GROUP BY` + cache 5 giây.
  - Tự động nén `br` / `gzip` cho response >= 1 KB, `ETag` + `304 Not Modified` cho tệp tĩnh `dist/`, và `PRAGMA wal_checkpoint(TRUNCATE)` khi tắt server.
- **Triển khai Docker**: dùng [Dockerfile](../Dockerfile) multi-stage (Node 24 Alpine, user không phải root, volume `/app/data`, tích hợp `HEALTHCHECK`).

```bash
docker build -t dudu-hanngu .
docker run -p 3001:3001 -v dudu_data:/app/data dudu-hanngu
```
