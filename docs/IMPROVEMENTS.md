# Nhật ký hoàn thiện — DuDu Hán Ngữ

Ghi lại lượt nâng cấp "hoàn thiện frontend + backend trình duyệt" (tháng 11/2026).
Mục tiêu: giao diện sạch — sinh động — nhất quán; dữ liệu và pipeline AI vững
trước lỗi mạng, đầy bộ nhớ và nhiều tab; kiểm thử tự động chứng minh.

## 1. Lỗi đã sửa (P0)

| Lỗi | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Dark mode có card trắng, chữ không đọc được | `applyTheme()` inject **inline** biến bảng màu sáng vào `<html>`, đè lên khối `.dark` trong CSS | Chuyển toàn bộ palette sang CSS theo `html[data-color-theme="pastel/rose/ocean"]` + `.dark`; JS chỉ set attribute |
| Học trên mobile tràn ngang (418px > 390px) | Hàng tiêu đề bài học `flex justify-between` không xuống dòng, hai nút bị cắt | `LearnScreen` xếp cột dưới 640px, nút chia đều; CSS `.learn-toolbar` dự phòng |
| Tab bar bị dồn/cắt (màn Ôn tập 7 tab) | `.tabs-container { justify-content: space-between }` + thiếu scroll affordance | Tab bar cuộn ngang dùng chung cho Học/Ôn tập, indicator trượt, fade mép phải |
| Nhãn "THỨ 6 / THỨ 7" lặp lại, sai chiều | `Intl.DateTimeFormat('vi-VN', {weekday:'short'})` trả "Th 6" rồi nhân bản cho cả cột | Dùng nhãn `CN, T2…T7` cố định |
| Nút Pomodoro đỏ nổi đè nội dung + nút `?` trùng | FAB absolute ở góc phải đè card/right panel | Pomodoro thành card trong right panel (desktop) và pill nhỏ `xl:hidden` (mobile); state nâng lên `usePomodoro` |
| Upsell "DuDu Plus — Nâng cấp ngay" không có thật | Placeholder marketing | Thay bằng "Góc học tập" (mẹo học theo ngày + tiến độ mục tiêu + luyện nhanh) |
| "Bảng xếp hạng" thực chất là XP theo tuần | Đặt tên sai | Đổi thành "Nhịp XP theo tuần" + bar tiến độ |
| Lỗi render = màn hình trắng | Không có error boundary | `src/components/ErrorBoundary.jsx` + luồng khôi phục (tải lại / thử lại / xoá dữ liệu cục bộ) |
| Màn "Sinh bài học" nháy "Chưa có tài liệu", bấm Bắt đầu khi tài liệu chưa tải xong | IndexedDB đọc async nhưng UI render ngay | Thêm skeleton `loading`; chỉ hiện nội dung/CTA khi đã đọc xong tài liệu; test chờ nút sẵn sàng |
| Header/quiz trùng lặp, thiếu thông tin | Search bar hiện cả khi đang làm quiz | Quiz dùng header "Đang luyện tập" gọn; thêm chip chuỗi đúng, thanh tiến độ từng câu, gợi ý phím tắt |
| Ảnh nền 2.8 MB (JPG) | Chưa tối ưu | WebP 1600px, chất lượng 68 → **880 KB** (−69%) |

## 2. Frontend

- **Design system** (`src/index.css`, `tailwind.config.js`): token 2 lớp (palette-independent + palette), 3 bảng màu × 2 chế độ, typography Lora/Inter/Hán tự có fluid scale, motion system (float, shimmer, pop-in, stagger) có `prefers-reduced-motion`, focus ring, tap target 44px, safe-area.
- **Trang chủ**: hero gradient nhiều lớp + mascot float, lời chào theo giờ, phụ đề theo tiến độ thật ("còn 17 câu nữa"), chip streak/mục tiêu/XP, nút CTA chia đều trên mobile.
- **Bài học**: header gọn hiển thị tiến độ `done/total câu`, badge "Đã xong", nút Playlist/Quiz; card từ vựng/ngữ pháp/mẫu câu giữ cấu trúc quen thuộc.
- **Quiz**: thanh tiến độ dạng segment, combo/chuỗi đúng, phản hồi đúng-sai có mascot + XP bay lên, tổng kết có "Làm lại lượt này" và "Luyện N câu sai".
- **Ôn tập**: trạng thái trống có CTA "Luyện quiz ngay"; tab SRS/câu sai/ghi chú dùng chung hệ tab.
- **Games/Matching**: màn chuẩn bị có gợi ý cách chơi + mascot; bảng ghép giữ nguyên.
- **Ngôn ngữ**: bỏ các eyebrow tiếng Anh ("Advanced Learning") và màu đỏ trang trí ở màn Chính tả/Phát âm/Câu ví dụ; highlight từ trong câu đổi sang màu bút dạ ấm.
- **Library**: ô nhập `.dudu` được style lại thành dropzone + button, card khóa học có hover rõ ràng.
- **A11y**: skip-link, focus trap modal, `aria-live` cho toast/phản hồi, `aria-keyshortcuts`, nhãn tiếng Việt cho progressbar.
- **PWA**: manifest + icon 192/512 + maskable + apple-touch-icon; SW precache app shell, network-first cho điều hướng, cache-first cho asset; banner offline.

## 3. "Backend" (tầng dữ liệu trình duyệt)

- `src/lib/storage.js`: đọc/ghi không bao giờ throw; `StorageError` có `code` + `userMessage`;
  tiến độ có `_schemaVersion` (v2) + `_savedAt`; validate/sanitize chống prototype pollution;
  BroadcastChannel (fallback `storage` event) để 2 tab không ghi đè nhau.
- `src/lib/db.js`: IndexedDB **v3** với thang nâng cấp v0/v1/v2 → v3, `DbError` typed,
  xử lý `blocked`/`versionchange`, thông báo thay đổi giữa các tab.
- `src/lib/geminiClient.js` + `queue.js`: timeout, `AbortSignal` lan truyền, backoff + jitter
  cho 429/5xx, đọc `Retry-After`, taxonomy lỗi (auth/quota/network/timeout/invalid-response)
  với thông điệp tiếng Việt; hàng đợi huỷ được cả request đang bay.
- `src/lib/processingJobs.js`: checkpoint job, phát hiện job gián đoạn sau F5.
- `src/lib/courseBackup.js`: validate schema + checksum + giới hạn dung lượng trước khi nhập.
- `src/main.jsx`: áp theme trước paint đầu tiên (không nháy trắng), ErrorBoundary, đăng ký SW ở production.
- `src/App.jsx`: dùng `readProgress/writeProgress`, toast khi tiến độ hỏng, lắng nghe thay đổi
  IndexedDB + progress từ tab khác (chống ping-pong bằng `remoteAppliedAtRef`), banner offline.

## 4. Kiểm thử & bằng chứng

- Thêm 6 bộ test node: `test:storage`, `test:db-schema`, `test:processing-jobs`,
  `test:gemini-retry`, `test:backup`, `test:pwa` (đều deterministic, không gọi mạng).
- `test:visual` (`scripts/screenshot-audit.mjs`): chụp **63 ảnh** — 17 màn hình × desktop/mobile/dark
  + 12 ảnh bảng màu rose/ocean × sáng/tối — assert không lỗi console, không tràn ngang, không màn trống,
  và token `--accent-subtle` phải tối trong dark mode.
- `test:pwa-e2e`: build production, chờ SW active, chuyển offline rồi reload — app vẫn render từ cache.
- Toàn bộ test node cũ vẫn xanh (`test:db`, `test:gemini`, `test:processing`, …).
- **18/18 bộ test pass** trong lần chạy cuối (gồm cả layout, course-flow, background-processing, pwa-e2e).
- Kết quả audit cuối: **"No console errors, overflow or empty screens detected."**
- `dist/` sau tối ưu: **2.08 MB** (trước đó ~4.9 MB chủ yếu do ảnh nền JPG).

## 5. Cách chạy lại

```bash
npm install
npm run build
npm run test:visual      # cần Chrome
npm run test:pwa-e2e     # cần Chrome + build
npm run test:ux && npm run test:storage && npm run test:db-schema
```
