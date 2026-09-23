from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TEMP = DATA / "_v2_tmp"
HANGUL = re.compile(r"[\uac00-\ud7af]")
HAN = re.compile(r"[\u4e00-\u9fff]")


def appears_in_example(term: str, example: str) -> bool:
    normalized_term = term.replace("一点儿", "点儿")
    parts = [part for part in re.split(r"[…·/]+", normalized_term) if part]
    for part in parts:
        if part in example:
            continue
        position = -1
        for char in part:
            position = example.find(char, position + 1)
            if position < 0:
                return False
    return True


def load_lesson(number: int) -> tuple[Path, dict]:
    temp_path = TEMP / f"glossary_bai{number:02d}.json"
    base = TEMP if number > 1 and temp_path.exists() else DATA
    path = base / f"glossary_bai{number:02d}.json"
    return path, json.loads(path.read_text(encoding="utf-8"))


def expected_ids(entries: list[dict], number: int) -> list[str]:
    result = []
    for kind, marker in (("word", "w"), ("grammar", "g"), ("phrase", "p")):
        count = sum(entry["type"] == kind for entry in entries)
        result.extend(f"bai{number:02d}_{marker}{index:03d}" for index in range(1, count + 1))
    return result


def main() -> None:
    totals = Counter()
    confidence = Counter()
    inferred_outliers = []
    all_payloads = []

    for number in range(1, 11):
        path, payload = load_lesson(number)
        raw = path.read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf"), f"BOM: {path}"
        entries = payload["entries"]
        metadata = payload["metadata"]
        ids = [entry["id"] for entry in entries]
        id_set = set(ids)

        assert ids == expected_ids(entries, number), f"IDs are not continuous: bai{number:02d}"
        assert len(ids) == len(id_set), f"Duplicate ID: bai{number:02d}"
        assert metadata["version"] == "2.0"
        assert metadata["total_entries"] == len(entries)
        assert metadata["word_count"] == sum(entry["type"] == "word" for entry in entries)
        assert metadata["grammar_count"] == sum(entry["type"] == "grammar" for entry in entries)
        assert metadata["phrase_count"] == sum(entry["type"] == "phrase" for entry in entries)
        assert not HANGUL.search(json.dumps(payload, ensure_ascii=False)), f"Hangul: bai{number:02d}"

        for entry in entries:
            assert "source_line" in entry and isinstance(entry["source_line"], int), entry["id"]
            assert "page" not in entry, entry["id"]
            assert 2 <= len(entry["related_words"]) <= 4, entry["id"]
            assert len(entry["related_words"]) == len(set(entry["related_words"])), entry["id"]
            assert entry["id"] not in entry["related_words"], entry["id"]
            assert all(related in id_set for related in entry["related_words"]), entry["id"]
            assert entry["confidence"] in {"high", "medium", "low"}, entry["id"]
            if entry["confidence"] == "low":
                assert entry["note"], entry["id"]
            confidence[entry["confidence"]] += 1

            if entry["type"] == "word":
                for field in ("example_zh", "example_pinyin", "example_vi", "example_source"):
                    assert entry[field], f"{entry['id']} missing {field}"
                assert appears_in_example(entry["word_zh"], entry["example_zh"]), (
                    f"{entry['id']} example omits target word"
                )
                assert entry["example_source"] in {"document", "ai_inferred"}, entry["id"]
                if entry["example_source"] == "ai_inferred":
                    han_length = len(HAN.findall(entry["example_zh"]))
                    if not 5 <= han_length <= 15:
                        inferred_outliers.append((entry["id"], han_length, entry["example_zh"]))

        word_entries = [entry for entry in entries if entry["type"] == "word"]
        example_stats = Counter(entry["example_source"] for entry in word_entries)
        assert metadata["example_stats"] == {
            "from_document": example_stats["document"],
            "ai_inferred": example_stats["ai_inferred"],
            "missing": 0,
        }
        totals.update({
            "entries": len(entries),
            "word": metadata["word_count"],
            "grammar": metadata["grammar_count"],
            "phrase": metadata["phrase_count"],
            "document_examples": example_stats["document"],
            "inferred_examples": example_stats["ai_inferred"],
        })
        all_payloads.append(payload)

    bai9 = all_payloads[8]
    sleep_example = next(entry for entry in bai9["entries"] if entry.get("word_zh") == "却")
    assert "shuì bù zháo" in sleep_example["example_pinyin"], sleep_example["example_pinyin"]

    index_path = DATA / "glossary_index.json"
    index_raw = index_path.read_bytes()
    assert not index_raw.startswith(b"\xef\xbb\xbf"), "BOM: glossary_index.json"
    index = json.loads(index_raw.decode("utf-8"))
    assert index["version"] == "2.0"
    assert index["total_bai"] == 10
    assert index["total_entries"] == totals["entries"]
    assert index["total_word_count"] == totals["word"]
    assert index["total_grammar_count"] == totals["grammar"]
    assert index["total_phrase_count"] == totals["phrase"]
    assert index["example_stats"] == {
        "from_document": totals["document_examples"],
        "ai_inferred": totals["inferred_examples"],
        "missing": 0,
    }
    assert len(index["bais"]) == 10

    print(json.dumps({
        "totals": dict(totals),
        "confidence": dict(confidence),
        "inferred_length_outliers": inferred_outliers,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
