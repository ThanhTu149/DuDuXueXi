from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUTPUT = DATA / "quiz_index.json"

MCQ_TYPES = {
    "mcq_meaning_zh_to_vi",
    "mcq_meaning_vi_to_zh",
    "mcq_pinyin",
    "mcq_word_type",
    "mcq_fill_blank",
    "mcq_grammar",
    "mcq_error_detection",
    "reading_comprehension",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    bais = []
    level_totals: Counter[str] = Counter()
    type_totals: Counter[str] = Counter()
    total_questions = 0

    for bai in range(1, 11):
        path = DATA / f"quiz_bai{bai:02d}.json"
        if not path.exists():
            raise FileNotFoundError(f"Missing {path.relative_to(ROOT)}")

        document = read_json(path)
        questions = document.get("questions", [])
        if len(questions) != 30:
            raise ValueError(f"{path.name} has {len(questions)} questions, expected 30")

        levels = Counter(question["level"] for question in questions)
        types = Counter(question["type"] for question in questions)
        mcq_count = sum(count for name, count in types.items() if name in MCQ_TYPES)
        typed_count = len(questions) - mcq_count

        total_questions += len(questions)
        level_totals.update(levels)
        type_totals.update(types)
        bais.append(
            {
                "bai": bai,
                "file": path.name,
                "title_zh": document.get("metadata", {}).get("title_zh"),
                "questions": len(questions),
                "mcq_questions": mcq_count,
                "typed_questions": typed_count,
                "synthesize_questions": levels.get("synthesize", 0),
            }
        )

    index = {
        "total_bai": len(bais),
        "total_questions": total_questions,
        "bais": bais,
        "group_totals": {
            "mcq": sum(count for name, count in type_totals.items() if name in MCQ_TYPES),
            "typed": sum(count for name, count in type_totals.items() if name not in MCQ_TYPES),
        },
        "level_totals": dict(level_totals),
        "type_totals": dict(type_totals),
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "version": "2.0",
    }

    serialized = json.dumps(index, ensure_ascii=False, indent=2) + "\n"
    json.loads(serialized)
    OUTPUT.write_text(serialized, encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {total_questions} questions.")


if __name__ == "__main__":
    main()
