from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def main() -> None:
    bais = []
    totals = {
        "entries": 0,
        "word_count": 0,
        "grammar_count": 0,
        "phrase_count": 0,
        "from_document": 0,
        "ai_inferred": 0,
        "missing": 0,
    }

    for number in range(1, 11):
        filename = f"glossary_bai{number:02d}.json"
        payload = json.loads((DATA / filename).read_text(encoding="utf-8"))
        metadata = payload["metadata"]
        assert metadata["version"] == "2.0", filename
        assert metadata["total_entries"] == len(payload["entries"]), filename

        summary = {
            "bai": number,
            "file": filename,
            "entries": metadata["total_entries"],
            "word_count": metadata["word_count"],
            "grammar_count": metadata["grammar_count"],
            "phrase_count": metadata["phrase_count"],
            "example_stats": metadata["example_stats"],
        }
        bais.append(summary)
        totals["entries"] += summary["entries"]
        totals["word_count"] += summary["word_count"]
        totals["grammar_count"] += summary["grammar_count"]
        totals["phrase_count"] += summary["phrase_count"]
        for key in ("from_document", "ai_inferred", "missing"):
            totals[key] += summary["example_stats"][key]

    index = {
        "total_bai": len(bais),
        "total_entries": totals["entries"],
        "total_word_count": totals["word_count"],
        "total_grammar_count": totals["grammar_count"],
        "total_phrase_count": totals["phrase_count"],
        "example_stats": {
            "from_document": totals["from_document"],
            "ai_inferred": totals["ai_inferred"],
            "missing": totals["missing"],
        },
        "bais": bais,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "version": "2.0",
    }

    output = DATA / "glossary_index.json"
    output.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reparsed = json.loads(output.read_text(encoding="utf-8"))
    assert reparsed == index
    print(json.dumps(index, ensure_ascii=False))


if __name__ == "__main__":
    main()
