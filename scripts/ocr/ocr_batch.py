"""
OCR BATCH SCRIPT cho PDF scan sách Hán ngữ
- Chạy 1 lần, có RESUME (dừng giữa chừng vẫn tiếp tục được)
- Lưu từng trang riêng để không mất tiến độ
- Tự động lọc watermark quảng cáo Hanka
- Tự merge thành file cuối
"""

import os
import sys
import time
from pathlib import Path
from pdf2image import convert_from_path, pdfinfo_from_path
import pytesseract

# ============ CONFIG ============
PDF_PATH = Path("docs/DuDu3.pdf")
BASE_DIR = Path("data/_extracted")
PAGES_DIR = BASE_DIR / "pages"
FINAL_TXT = BASE_DIR / "DuDu3_full.txt"

# Tesseract & Poppler (đường dẫn tuyệt đối)
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
POPPLER_PATH = r"C:\Program Files\poppler\Library\bin"

# OCR settings
DPI = 200
LANG = "chi_sim+eng"   # chi_sim cho chữ Hán, eng cho pinyin + chú thích Việt

# Watermark keywords cần lọc (quảng cáo Hanka)
WATERMARK_KEYWORDS = [
    "hanka.edu.vn",
    "0972.556.968",
    "0984.665.229",
    "0972556968",
    "0984665229",
    "TRUNG TAM NGOANGD HANKA",
    "TRUNG TÂM NGOẠI NGỮ HANKA",
    "Chuyen dao tao tieng trung",
    "Chuyên đào tạo tiếng trung",
    "cho nguoi moi hec",
]


def setup():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)


def get_total_pages():
    info = pdfinfo_from_path(str(PDF_PATH), poppler_path=POPPLER_PATH)
    return info["Pages"]


def ocr_page(page_num):
    images = convert_from_path(
        str(PDF_PATH),
        dpi=DPI,
        first_page=page_num,
        last_page=page_num,
        poppler_path=POPPLER_PATH,
    )
    if not images:
        return ""
    return pytesseract.image_to_string(images[0], lang=LANG)


def clean_watermark(text):
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        line_lower = line.lower()
        if any(kw.lower() in line_lower for kw in WATERMARK_KEYWORDS):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


def ocr_page_with_cache(page_num):
    page_file = PAGES_DIR / f"page_{page_num:04d}.txt"
    if page_file.exists():
        return page_file.read_text(encoding="utf-8"), True
    try:
        text = ocr_page(page_num)
        text = clean_watermark(text)
        page_file.write_text(text, encoding="utf-8")
        return text, False
    except Exception as e:
        print(f"   ❌ Lỗi trang {page_num}: {e}")
        return "", False


def merge_all(total):
    parts = []
    for i in range(1, total + 1):
        page_file = PAGES_DIR / f"page_{i:04d}.txt"
        if page_file.exists():
            text = page_file.read_text(encoding="utf-8")
            parts.append(f"\n\n===== TRANG {i} =====\n\n{text}")
    FINAL_TXT.write_text("".join(parts), encoding="utf-8")


def main():
    setup()

    if not PDF_PATH.exists():
        print(f"❌ Không tìm thấy: {PDF_PATH}")
        sys.exit(1)

    print("=" * 60)
    print("  OCR BATCH SCRIPT - SÁCH HÁN NGỮ")
    print("=" * 60)
    print(f"PDF    : {PDF_PATH}")
    print(f"Output : {FINAL_TXT}")
    print(f"DPI    : {DPI} | Lang: {LANG}")
    print()

    try:
        total = get_total_pages()
    except Exception as e:
        print(f"❌ Không đọc được PDF: {e}")
        sys.exit(1)

    done = len(list(PAGES_DIR.glob("page_*.txt")))
    print(f"📄 Tổng số trang : {total}")
    print(f"✅ Đã OCR        : {done}/{total}")
    print(f"⏳ Còn lại       : {total - done}")
    print()

    if done == total:
        print("🎉 Tất cả trang đã OCR xong!")
        print("→ Đang merge...")
        merge_all(total)
        print(f"✅ Xong: {FINAL_TXT}")
        return

    print("⚠️  Có thể bấm Ctrl+C để dừng. Chạy lại sẽ tiếp tục từ chỗ dừng.")
    print("⏱️  Ước tính: 1-2 tiếng cho toàn bộ 185 trang")
    print()
    time.sleep(2)

    start_time = time.time()
    newly_ocr = 0

    try:
        for i in range(1, total + 1):
            page_start = time.time()
            text, cached = ocr_page_with_cache(i)
            elapsed = time.time() - page_start

            if cached:
                status = "💾 cache"
            else:
                status = f"✅ {elapsed:.1f}s"
                newly_ocr += 1

            chars = len(text.strip())

            # ETA
            if newly_ocr > 2:
                total_elapsed = time.time() - start_time
                avg = total_elapsed / newly_ocr
                remaining = total - i
                eta_min = (avg * remaining) / 60
                eta_str = f"ETA ~{eta_min:.0f} phút"
            else:
                eta_str = "đang khởi động..."

            print(f"[{i:3d}/{total}] {status:12s} | {chars:5d} ký tự | {eta_str}")

    except KeyboardInterrupt:
        print()
        print("⏸️  DỪNG THEO YÊU CẦU")
        done_now = len(list(PAGES_DIR.glob("page_*.txt")))
        print(f"→ Đã OCR: {done_now}/{total} trang")
        print(f"→ Chạy lại: python ocr_batch.py (sẽ skip trang đã OCR)")
        return

    print()
    print("🎉 OCR XONG TOÀN BỘ!")
    print("→ Đang merge...")
    merge_all(total)
    print(f"✅ File cuối: {FINAL_TXT}")

    text = FINAL_TXT.read_text(encoding="utf-8")
    print()
    print("=" * 60)
    print("  THỐNG KÊ")
    print("=" * 60)
    print(f"Tổng ký tự : {len(text):,}")
    print(f"Tổng dòng  : {text.count(chr(10)):,}")
    print(f"Thời gian  : {(time.time() - start_time) / 60:.1f} phút")
    print(f"Thời gian  : {(time.time() - start_time) / 60:.1f} phút")

if __name__ == "__main__":
    main()
    