# DuDu Hán Ngữ

SPA học tiếng Trung cho sinh viên Việt Nam, xây bằng React, Vite và Tailwind CSS. Mười bài có sẵn được nạp từ JSON trong `data/`; khóa học tự tạo và tài liệu nhập được lưu trong IndexedDB của trình duyệt.

## Chạy local

```bash
npm install
npm run dev
```

Mở URL Vite hiển thị trong terminal, thường là `http://localhost:5173`.

## Build production

```bash
npm run build
npm run preview
```

Build được ghi vào `dist/`. Tiến độ được lưu riêng theo khóa học trong IndexedDB; tiến độ khóa mặc định vẫn được giữ trong `localStorage` để tương thích dữ liệu cũ.

## Nhập tài liệu và tạo bài học

1. Mở **Thư viện** ở thanh bên, nhập tên rồi chọn **Thêm khóa học**.
2. Chọn PDF có lớp chữ, DOCX hoặc TXT (tối đa 100 MB). Xem trước text và các đoạn, rồi chọn **Lưu tài liệu và tiếp tục**.
3. Trong **Hồ sơ > Cài đặt**, lưu Gemini API key và chọn model. Quay lại Thư viện, chọn **Sinh bài học**.
4. Kiểm tra bản nháp ở **Duyệt nội dung**, sửa/xóa mục cần thiết rồi chọn **Lưu vào khóa học**.

Sau khi bắt đầu sinh bài học, có thể chuyển sang mục khác trong app; thanh tiến độ và nút **Xem tiến độ** vẫn hoạt động. Mỗi đoạn hoàn tất được lưu vào IndexedDB. Nếu tải lại hoặc đóng tab, quá trình không chạy khi trang đã đóng nhưng sẽ tự tiếp tục từ đoạn chưa xong khi mở lại app (trừ khi đã chọn **Tạm dừng** hoặc **Hủy**). Giữ thiết bị có mạng và tab mở để xử lý liên tục.

PDF scan ảnh chưa được hỗ trợ OCR. PDF/DOCX dùng pdf.js và Mammoth tải động từ CDN khi nhập; cần kết nối mạng cho hai định dạng này và cho Gemini. Nội dung gửi Gemini chỉ là text trích xuất, không phải file gốc. API key lưu cục bộ trong IndexedDB; không nhập key trên máy dùng chung. Tốc độ gọi Gemini được giới hạn theo hàng đợi và quota thực tế tùy tài khoản/model.

Trong Thư viện có thể đổi tên, nhân bản, ghép, xóa và xuất/nhập khóa học dạng `.dudu` có checksum. Sao lưu này chứa nội dung khóa học, không chứa tiến độ học. **Hồ sơ > Cài đặt** vẫn có xuất/nhập JSON tiến độ riêng.

## Kiểm thử

```bash
# Dữ liệu, pipeline AI, tiến độ, sao lưu, PWA (node thuần, deterministic)
npm run test:db
npm run test:extractors
npm run test:gemini
npm run test:gemini-retry
npm run test:word-editor
npm run test:content-editor
npm run test:processing
npm run test:processing-jobs
npm run test:background-processing
npm run test:storage
npm run test:db-schema
npm run test:backup
npm run test:pwa
npm run test:ux

# Cần Chrome (Puppeteer): layout + audit ảnh chụp mọi màn hình
npm run test:layout
npm run test:visual   # build trước: ghi ảnh vào test-artifacts/audit
npm run test:pwa-e2e  # build trước: nạp lại trang khi offline, phải render từ cache
npm run test:course-flow
```

Các kiểm thử Gemini dùng phản hồi giả lập, không gọi API thật. `test:visual` chụp 63 ảnh (desktop / mobile / dark mode / 3 bảng màu) và báo lỗi console, tràn ngang, màn hình trống hoặc token sáng sai trong dark mode.

## Bền bỉ dữ liệu và offline (PWA)

- **Tiến độ có version + kiểm tra hợp lệ**: JSON hỏng không còn âm thầm reset; app hiện toast "Tiến độ cũ bị hỏng" và đi tiếp với dữ liệu mặc định.
- **Lưu trữ an toàn**: mọi lần ghi localStorage đều trả về kết quả; khi đầy bộ nhớ (quota) app báo cách xử lý thay vì mất dữ liệu.
- **Đồng bộ nhiều tab**: mở app ở 2 tab không ghi đè lẫn nhau (BroadcastChannel + so sánh `_savedAt`); thay đổi thư viện/cài đặt ở tab này tự làm mới tab kia.
- **IndexedDB schema v3** với thang nâng cấp an toàn, lỗi giao dịch có mã lỗi rõ ràng, xử lý trường hợp DB bị tab khác nâng cấp.
- **Pipeline Gemini** có timeout, `AbortSignal`, backoff + jitter cho 429/5xx (tôn trọng `Retry-After`), phân loại lỗi mạng/quota/auth thành câu tiếng Việt dễ hiểu; job xử lý lưu checkpoint và tiếp tục sau khi F5.
- **PWA**: `manifest.webmanifest` + service worker cache app shell và các chunk bài học; mất mạng vẫn học được, có banner "Mất kết nối mạng".
- **Sao lưu `.dudu`** được kiểm tra schema + checksum trước khi nhập, chặn prototype pollution.
- **Error Boundary toàn cục**: lỗi render không còn màn hình trắng — có nút tải lại, thử khôi phục giao diện và xoá dữ liệu cục bộ (kèm xác nhận).

## Giao diện

- Giao diện `Sáng` / `Tối` / `Tự động` (06:00–18:00) và 3 bảng màu `Học thuật` / `Hoa đào` / `Biển xanh`; mọi bảng màu đều có biến thể tối riêng nên không còn card trắng trong dark mode.
- Typography: Lora cho tiêu đề, Inter cho nội dung, font Hán tự riêng cho chữ Trung; tab bar cuộn ngang, toolbar bài học tự xếp lại trên điện thoại.
- Motion có kiểm soát (`prefers-reduced-motion`), micro-interaction khi trả lời đúng/sai, XP bay lên, confetti khi hoàn hảo, skeleton shimmer khi tải.
- Ảnh nền chuyển sang WebP (2.8 MB → 880 KB) và preconnect font.
- Phím tắt: `Ctrl/Cmd+K` mở tìm kiếm/lệnh nhanh, `1–4` chọn đáp án, `Enter` kiểm tra/tiếp tục, `Ctrl+/` xem toàn bộ phím tắt.

## Quick Wins Phase 1

- Phát âm chữ Hán bằng Web Speech API.
- Tìm kiếm từ vựng, ngữ pháp và mẫu câu xuyên khóa học bằng `Ctrl+K` / `Cmd+K`.
- Mục tiêu số câu hằng ngày, lịch streak theo tháng và thưởng XP khi đạt mục tiêu.
- Bookmark từ vựng, ngữ pháp và mẫu câu trong tab `Ôn tập`.
- Giao diện `Sáng` / `Tối` / `Tự động` theo khung giờ 06:00-18:00.
- Pomodoro 25 phút học, 5 phút nghỉ; số phiên được lưu theo ngày.
- Xuất và nhập file JSON tiến độ tại `Hồ sơ` > `Cài đặt`.

Web Speech API và thông báo Pomodoro phụ thuộc vào khả năng và quyền của trình duyệt. Khi trình duyệt không hỗ trợ phát âm, nút đọc sẽ tự vô hiệu hóa.

## Core Features Phase 2

- SRS theo lịch nhớ SM-2 đơn giản với bốn mức đánh giá; từ được thêm tự động khi đọc hết bài hoặc trả lời quiz sai.
- Chế độ `Bài khóa` đọc trực tiếp 10 file OCR, hỗ trợ ẩn/hiện pinyin và tiếng Việt, phát âm và mở nhanh từ trong glossary.
- Ghi chú cá nhân cho từng từ vựng, ngữ pháp và mẫu câu; tổng hợp trong tab `Notes` của màn hình Ôn tập.
- Phân tích bài, nội dung, tag và dạng câu hay sai; có thể tạo lượt luyện riêng từ `Weak Topics`.
- Thành tích XP theo tuần và biểu đồ so sánh bốn tuần gần nhất trong Hồ sơ.

Toàn bộ SRS, ghi chú, lịch sử lỗi chi tiết và XP tuần được lưu chung trong file tiến độ, vì vậy chức năng xuất/nhập của Phase 1 cũng sao lưu các dữ liệu Phase 2.

## Dữ liệu

- `data/glossary_bai01.json` đến `data/glossary_bai10.json`
- `data/quiz_bai01.json` đến `data/quiz_bai10.json`
- `src/data-loader.js` gom toàn bộ dữ liệu cho ứng dụng
