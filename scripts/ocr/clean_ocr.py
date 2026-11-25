"""
CLEAN OCR TEXT - Sách Hán ngữ DuDu3
- Lọc watermark Hanka
- Bỏ trang bìa / bản quyền
- Chuẩn hóa khoảng trắng
- Output: DuDu3_clean.txt
"""

import re
from pathlib import Path

INPUT = Path("data/_extracted/DuDu3_full.txt")
OUTPUT = Path("data/_extracted/DuDu3_clean.txt")

# Trang bìa / bản quyền cần bỏ (trang 1-6)
SKIP_PAGES = {1, 2, 3, 4, 5, 6}

# Watermark cần lọc
WATERMARK_KEYWORDS = [
    "hanka.edu.vn",
    "0972.556.968",
    "0984.665.229",
    "0972556968",
    "0984665229",
    "trung tam ngoai ngu hanka",
    "trung tâm ngoại ngữ hanka",
    "trung tam ngoangd hanka",
    "chuyen dao tao tieng trung",
    "chuyên đào tạo tiếng trung",
    "cho nguoi moi hec",
    "cho nguoi moi hoc",
    "chuyén dao tao tiéng trung",
    "chuyén datamiigoir",
    "trung tam ngoai ngu’ hanka",
    "chuyén dao tao tiéng trung cho nguoi mdi hoc",
    "trung tam ngoai ngu hanka",
]


def is_watermark(line: str) -> bool:
    """Check nếu dòng chứa watermark."""
    line_lower = line.lower().strip()
    if not line_lower:
        return False
    return any(kw.lower() in line_lower for kw in WATERMARK_KEYWORDS)


def clean_line(line: str) -> str:
    """Chuẩn hóa 1 dòng."""
    # Bỏ khoảng trắng đầu cuối
    line = line.strip()
    # Bỏ số trang dạng "-91-" hoặc "- 91 -"
    line = re.sub(r'^-\s*\d+\s*-$', '', line)
    # Gộp nhiều khoảng trắng thành 1
    line = re.sub(r'[ \t]+', ' ', line)
    return line


def main():
    if not INPUT.exists():
        print(f"❌ Không tìm thấy: {INPUT}")
        return

    text = INPUT.read_text(encoding="utf-8")

    # Tách theo trang
    pages = re.split(r'=====\s*TRANG\s+(\d+)\s*=====', text)
    # pages[0] là header rỗng, sau đó là [số trang, nội dung, số trang, nội dung, ...]

    output_parts = []
    stats = {"kept": 0, "skipped": 0, "watermark_removed": 0}

    for i in range(1, len(pages), 2):
        page_num = int(pages[i])
        page_content = pages[i + 1] if i + 1 < len(pages) else ""

        if page_num in SKIP_PAGES:
            stats["skipped"] += 1
            continue

        cleaned_lines = []
        for line in page_content.split("\n"):
            if is_watermark(line):
                stats["watermark_removed"] += 1
                continue
            cleaned = clean_line(line)
            cleaned_lines.append(cleaned)

        # Bỏ dòng rỗng liên tiếp (giữ tối đa 1 dòng rỗng giữa các đoạn)
        result = []
        prev_empty = False
        for line in cleaned_lines:
            if not line:
                if not prev_empty:
                    result.append("")
                prev_empty = True
            else:
                result.append(line)
                prev_empty = False

        page_text = "\n".join(result).strip()
        if page_text:
            output_parts.append(f"===== TRANG {page_num} =====\n\n{page_text}\n")
            stats["kept"] += 1

    final = "\n\n".join(output_parts)
    OUTPUT.write_text(final, encoding="utf-8")

    print("=" * 60)
    print("  CLEAN OCR - HOÀN TẤT")
    print("=" * 60)
    print(f"Input  : {INPUT}")
    print(f"Output : {OUTPUT}")
    print()
    print(f"✅ Trang giữ lại    : {stats['kept']}")
    print(f"⏭️  Trang bỏ         : {stats['skipped']}")
    print(f"🧹 Dòng watermark   : {stats['watermark_removed']}")
    print(f"📏 Tổng ký tự       : {len(final):,}")
    print(f"📄 Tổng dòng        : {final.count(chr(10)):,}")


if __name__ == "__main__":
    main()