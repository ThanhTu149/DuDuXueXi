from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TMP = DATA / "_quiz_v2_tmp"

TYPE_DISTRIBUTION = {
    "mcq_meaning_zh_to_vi": 5,
    "mcq_meaning_vi_to_zh": 2,
    "mcq_pinyin": 2,
    "mcq_word_type": 2,
    "mcq_fill_blank": 4,
    "mcq_grammar": 2,
    "mcq_error_detection": 2,
    "reading_comprehension": 2,
    "translation_vi_to_zh": 4,
    "translation_zh_to_vi": 2,
    "typing_zh_from_pinyin": 2,
    "sentence_reorder": 1,
}

MCQ_TYPES = set(list(TYPE_DISTRIBUTION)[:8])
TYPED_TYPES = set(list(TYPE_DISTRIBUTION)[8:])
TRANSLATION_TYPES = {"translation_vi_to_zh", "translation_zh_to_vi"}
HANGUL_RE = re.compile(r"[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]")
HAN_RE = re.compile(r"[\u3400-\u9fff]")
PUNCT_RE = re.compile(r"[\s，。？！、；：‘’“”《》〈〉（）,.?!;:'\"()\[\]{}-]+")


def read_json(path: Path) -> dict:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"{path.name}: UTF-8 BOM is not allowed")
    return json.loads(raw.decode("utf-8"))


def normalize(value: str) -> str:
    return PUNCT_RE.sub("", value).lower()


def han_count(value: str) -> int:
    return len(HAN_RE.findall(value))


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def locate_quiz(bai: int) -> Path:
    final = DATA / f"quiz_bai{bai:02d}.json"
    draft = TMP / final.name
    if bai == 1 or final.exists():
        return final
    return draft


def validate_question(
    question: dict,
    bai: int,
    expected_id: str,
    glossary_ids: set[str],
    exercise_line: int,
    errors: list[str],
) -> None:
    prefix = question.get("id", expected_id)
    require(question.get("id") == expected_id, f"{prefix}: expected id {expected_id}", errors)
    require(question.get("bai") == bai, f"{prefix}: incorrect bai", errors)
    require(question.get("type") in TYPE_DISTRIBUTION, f"{prefix}: unknown type", errors)
    require(question.get("level") in {"recall", "understand", "apply", "synthesize"}, f"{prefix}: invalid level", errors)
    require(bool(question.get("question_vi")), f"{prefix}: missing question_vi", errors)
    require(question.get("confidence") in {"high", "medium", "low"}, f"{prefix}: invalid confidence", errors)
    require(isinstance(question.get("difficulty_score"), int) and 1 <= question["difficulty_score"] <= 5, f"{prefix}: invalid difficulty", errors)

    related = question.get("related_glossary")
    require(isinstance(related, list) and bool(related), f"{prefix}: missing related_glossary", errors)
    if isinstance(related, list):
        unknown = sorted(set(related) - glossary_ids)
        require(not unknown, f"{prefix}: unknown glossary ids {unknown}", errors)

    source = question.get("source")
    require(isinstance(source, dict), f"{prefix}: missing source", errors)
    if isinstance(source, dict):
        line = source.get("source_line")
        require(isinstance(line, int) and 1 <= line < exercise_line, f"{prefix}: source_line {line!r} is outside learning content", errors)

    explanation = question.get("explanation")
    require(isinstance(explanation, dict), f"{prefix}: missing explanation", errors)
    if isinstance(explanation, dict):
        for field in ("why_correct", "keyword_tip", "concept"):
            require(bool(explanation.get(field)), f"{prefix}: missing explanation.{field}", errors)

    qtype = question.get("type")
    if qtype in MCQ_TYPES:
        options = question.get("options")
        require(isinstance(options, list) and len(options) == 4, f"{prefix}: MCQ must have four options", errors)
        if isinstance(options, list):
            option_ids = [item.get("id") for item in options if isinstance(item, dict)]
            option_texts = [normalize(str(item.get("text", ""))) for item in options if isinstance(item, dict)]
            require(option_ids == ["A", "B", "C", "D"], f"{prefix}: option ids must be A-D", errors)
            require(len(set(option_texts)) == 4 and all(option_texts), f"{prefix}: duplicate or empty options", errors)
            correct = question.get("correct_option")
            require(correct in option_ids, f"{prefix}: invalid correct_option", errors)
            if isinstance(explanation, dict):
                wrong = explanation.get("why_others_wrong")
                expected_wrong = set(option_ids) - {correct}
                require(isinstance(wrong, dict) and set(wrong) == expected_wrong, f"{prefix}: why_others_wrong does not match distractors", errors)
    elif qtype in TYPED_TYPES:
        sample = question.get("sample_answer")
        alternatives = question.get("alternative_answers")
        require(isinstance(sample, str) and bool(sample.strip()), f"{prefix}: missing sample_answer", errors)
        require(isinstance(alternatives, list), f"{prefix}: alternative_answers must be an array", errors)
        require(isinstance(question.get("hints"), list) and 2 <= len(question["hints"]) <= 3, f"{prefix}: expected 2-3 hints", errors)
        if isinstance(explanation, dict):
            mistakes = explanation.get("common_mistakes")
            require(isinstance(mistakes, list) and bool(mistakes), f"{prefix}: missing common_mistakes", errors)
        if isinstance(sample, str) and isinstance(alternatives, list):
            sample_norm = normalize(sample)
            alt_norms = [normalize(str(item)) for item in alternatives]
            require(sample_norm not in alt_norms, f"{prefix}: alternative duplicates sample", errors)
            require(len(alt_norms) == len(set(alt_norms)), f"{prefix}: duplicate alternatives", errors)
            if qtype != "typing_zh_from_pinyin":
                require(1 <= len(alternatives) <= 3, f"{prefix}: expected 1-3 alternative answers", errors)
                for alt in alternatives:
                    ratio = SequenceMatcher(None, sample_norm, normalize(str(alt))).ratio()
                    require(ratio >= 0.35, f"{prefix}: alternative answer is probably unrelated: {alt!r}", errors)

        if qtype in TRANSLATION_TYPES or qtype == "sentence_reorder":
            required = question.get("keywords_required")
            optional = question.get("keywords_optional")
            require(isinstance(required, list) and 2 <= len(required) <= 4, f"{prefix}: keywords_required must contain 2-4 items", errors)
            require(isinstance(optional, list), f"{prefix}: keywords_optional must be an array", errors)
            if isinstance(required, list):
                keys = [normalize(str(item.get("zh") or item.get("vi") or "")) for item in required if isinstance(item, dict)]
                require(len(keys) == len(required) and len(set(keys)) == len(keys) and all(keys), f"{prefix}: invalid or duplicate required keywords", errors)

        if qtype in {"translation_vi_to_zh", "sentence_reorder"} and isinstance(sample, str):
            count = han_count(sample)
            require(5 <= count <= 15, f"{prefix}: Chinese answer has {count} Han characters, expected 5-15", errors)
            require(bool(question.get("sample_answer_pinyin")), f"{prefix}: missing sample_answer_pinyin", errors)
        if qtype == "translation_zh_to_vi":
            require(bool(question.get("source_sentence_pinyin")), f"{prefix}: missing source_sentence_pinyin", errors)
        if qtype == "typing_zh_from_pinyin":
            require(bool(question.get("pinyin")), f"{prefix}: missing pinyin", errors)
            require(bool(question.get("meaning_vi")), f"{prefix}: missing meaning_vi", errors)
        if qtype == "sentence_reorder" and isinstance(sample, str):
            parts = question.get("shuffled_parts")
            require(isinstance(parts, list) and len(parts) >= 4, f"{prefix}: sentence_reorder needs at least four parts", errors)
            if isinstance(parts, list):
                reconstructed = normalize("".join(str(part) for part in parts))
                require(Counter(reconstructed) == Counter(normalize(sample)), f"{prefix}: shuffled_parts do not reconstruct sample_answer", errors)


def validate_bai(bai: int) -> tuple[list[str], dict]:
    errors: list[str] = []
    quiz_path = locate_quiz(bai)
    glossary_path = DATA / f"glossary_bai{bai:02d}.json"
    source_path = DATA / "_extracted" / "bai" / f"bai{bai:02d}.txt"

    require(quiz_path.exists(), f"bai{bai:02d}: missing quiz file", errors)
    require(glossary_path.exists(), f"bai{bai:02d}: missing glossary file", errors)
    require(source_path.exists(), f"bai{bai:02d}: missing source text", errors)
    if errors:
        return errors, {}

    quiz = read_json(quiz_path)
    glossary = read_json(glossary_path)
    source_lines = source_path.read_text(encoding="utf-8").splitlines()
    exercise_line = next((i for i, line in enumerate(source_lines, start=1) if "练习" in line), len(source_lines) + 1)
    glossary_entries = glossary.get("entries", [])
    glossary_ids = {entry.get("id") for entry in glossary_entries}
    word_ids = {entry.get("id") for entry in glossary_entries if entry.get("type") == "word"}
    grammar_ids = {entry.get("id") for entry in glossary_entries if entry.get("type") == "grammar"}

    questions = quiz.get("questions")
    require(isinstance(questions, list) and len(questions) == 30, f"bai{bai:02d}: expected 30 questions", errors)
    if not isinstance(questions, list):
        return errors, {}

    types = Counter(question.get("type") for question in questions)
    levels = Counter(question.get("level") for question in questions)
    require(dict(types) == TYPE_DISTRIBUTION, f"bai{bai:02d}: incorrect type distribution {dict(types)}", errors)
    require(sum(types[t] for t in MCQ_TYPES) == 21, f"bai{bai:02d}: MCQ count is not 21", errors)
    require(sum(types[t] for t in TYPED_TYPES) == 9, f"bai{bai:02d}: typed count is not 9", errors)
    if bai >= 2:
        require(4 <= levels["synthesize"] <= 5, f"bai{bai:02d}: synthesize count must be 4-5", errors)

    metadata = quiz.get("metadata", {})
    require(metadata.get("total_questions") == 30, f"bai{bai:02d}: metadata total_questions mismatch", errors)
    require(metadata.get("type_distribution") == TYPE_DISTRIBUTION, f"bai{bai:02d}: metadata type_distribution mismatch", errors)
    require(metadata.get("level_distribution") == dict(levels), f"bai{bai:02d}: metadata level_distribution mismatch", errors)

    all_text = json.dumps(quiz, ensure_ascii=False)
    require(not HANGUL_RE.search(all_text), f"bai{bai:02d}: Korean text detected", errors)
    require('"page"' not in all_text, f"bai{bai:02d}: deprecated page field detected", errors)

    coverage: Counter[str] = Counter()
    for number, question in enumerate(questions, start=1):
        expected_id = f"quiz_bai{bai:02d}_{number:03d}"
        validate_question(question, bai, expected_id, glossary_ids, exercise_line, errors)
        coverage.update(question.get("related_glossary", []))

    missing_words = sorted(word_ids - set(coverage))
    require(not missing_words, f"bai{bai:02d}: words without a quiz link {missing_words}", errors)
    for grammar_id in sorted(grammar_ids):
        require(2 <= coverage[grammar_id] <= 3, f"bai{bai:02d}: {grammar_id} appears in {coverage[grammar_id]} questions, expected 2-3", errors)

    suspicious_pinyin = []
    for question in questions:
        for field in ("sample_answer_pinyin", "source_sentence_pinyin", "pinyin"):
            value = question.get(field)
            if isinstance(value, str) and re.search(r"\b(?:zhe jí|déguo|yícì|liǎngcì|sāncì|liǎngbiàn)\b", value, re.IGNORECASE):
                suspicious_pinyin.append(f"{question.get('id')}:{field}={value}")
    require(not suspicious_pinyin, f"bai{bai:02d}: suspicious pinyin {suspicious_pinyin}", errors)

    return errors, {
        "bai": bai,
        "path": str(quiz_path.relative_to(ROOT)),
        "types": dict(types),
        "levels": dict(levels),
        "linked_glossary": len(coverage),
        "glossary_entries": len(glossary_ids),
    }


def main() -> int:
    all_errors: list[str] = []
    reports = []
    for bai in range(1, 11):
        errors, report = validate_bai(bai)
        all_errors.extend(errors)
        if report:
            reports.append(report)

    if all_errors:
        print(f"Validation failed with {len(all_errors)} issue(s):")
        for error in all_errors:
            print(f"- {error}")
        return 1

    print("Quiz validation passed for bai01-bai10.")
    for report in reports:
        print(
            f"- bai{report['bai']:02d}: 30 questions, "
            f"levels={report['levels']}, glossary={report['linked_glossary']}/{report['glossary_entries']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
