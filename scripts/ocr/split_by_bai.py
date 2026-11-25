"""
SPLIT BY BAI - Chia DuDu3_clean.txt thành 10 file theo bài
- Detect marker: BAI X (viết hoa) hoặc 第X课 (chữ Hán)
- Output: data/_extracted/bai/bai01.txt ... bai10.txt
"""

import re
from pathlib import Path

INPUT = Path("data/_extracted/DuDu3_clean.txt")
OUTDIR = Path("data/_extracted/bai")
OUTDIR.mkdir(parents=True, exist_ok=True)

# Ranh giới: bỏ mục lục đầu (dòng < 140) và mục lục cuối (dòng > 7980)
SKIP_HEAD = 140
SKIP_TAIL = 7980

# Pattern detect bài
BAI_PATTERN = re.compile(
    r'^\s*BAI\s*(\d+)|第\s*([一二三四五六七八九十]+)\s*课',
    re.IGNORECASE
)

# Map chữ Hán -> số
HAN_TO_NUM = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
}


def detect_bai(line: str):
    """Trả về số bài nếu dòng là marker, ngược lại None."""
    m = BAI_PATTERN.search(line)
    if not m:
        return None
    if m.group(1):  # BAI X
        return int(m.group(1))
    if m.group(2):  # 第X课
        return HAN_TO_NUM.get(m.group(2))
    return None


def main():
    if not INPUT.exists():
        print(f"❌ Không tìm thấy: {INPUT}")
        return

    text = INPUT.read_text(encoding="utf-8")
    lines = text.split("\n")

    print(f"📄 Tổng dòng file gốc: {len(lines):,}")
    print(f"🔍 Đang tìm marker bài (bỏ dòng < {SKIP_HEAD} và > {SKIP_TAIL})...\n")

    # Tìm marker
    markers = []
    for i, line in enumerate(lines):
        if i < SKIP_HEAD or i > SKIP_TAIL:
            continue
        bai_num = detect_bai(line)
        if bai_num:
            markers.append((bai_num, i, line.strip()))

    # Loại marker trùng — lấy marker đầu tiên của mỗi bài
    seen = set()
    unique = []
    for num, idx, line in markers:
        if num not in seen and 1 <= num <= 10:
            seen.add(num)
            unique.append((num, idx, line))

    unique.sort()

    print(f"✅ Tìm được {len(unique)} bài:\n")
    for num, idx, line in unique:
        print(f"   Bài {num:2d} — dòng {idx:5d} — {line[:60]}")

    print()
    print("=" * 60)
    print("  SPLIT")
    print("=" * 60)

    total_chars = 0
    for i, (num, idx, line) in enumerate(unique):
        end = unique[i + 1][1] if i + 1 < len(unique) else SKIP_TAIL
        content = "\n".join(lines[idx:end])
        outfile = OUTDIR / f"bai{num:02d}.txt"
        outfile.write_text(content, encoding="utf-8")
        total_chars += len(content)
        print(f"✅ {outfile.name}: dòng {idx:5d} → {end:5d} ({len(content):>7,} ký tự)")

    print()
    print(f"📊 Tổng ký tự: {total_chars:,}")
    print(f"📁 Output: {OUTDIR}")


if __name__ == "__main__":
    main()