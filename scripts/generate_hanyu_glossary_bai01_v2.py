from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".codex_deps"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pypinyin import Style, lazy_pinyin  # noqa: E402

from generate_hanyu_glossary import LESSONS, type_tags  # noqa: E402


# example_zh, example_vi, source_line, optional OCR note
WORD_EXAMPLES = {
    "变化": ("这几年变化很大。", "Mấy năm nay thay đổi rất lớn.", 80, None),
    "暑假": ("今年暑假我还在那儿玩了一个多月呢。", "Kỳ nghỉ hè năm nay tôi còn ở đó chơi hơn một tháng.", 21, "OCR ghi nhầm 署假; đã phục hồi thành 暑假."),
    "还": ("今年暑假我还在那儿玩了一个多月呢。", "Kỳ nghỉ hè năm nay tôi còn ở đó chơi hơn một tháng.", 82, None),
    "比": ("上海比北京大吧？", "Thượng Hải lớn hơn Bắc Kinh phải không?", 17, None),
    "人口": ("不过人口比北京多。", "Nhưng dân số đông hơn Bắc Kinh.", 25, None),
    "最": ("上海是中国人口最多的城市。", "Thượng Hải là thành phố đông dân nhất Trung Quốc.", 27, None),
    "城市": ("上海是中国人口最多的城市。", "Thượng Hải là thành phố đông dân nhất Trung Quốc.", 84, None),
    "增加": ("这几年增加了不少新建筑。", "Mấy năm nay đã có thêm khá nhiều công trình mới.", 85, None),
    "建筑": ("这几年增加了不少新建筑。", "Mấy năm nay đã có thêm khá nhiều công trình mới.", 86, None),
    "过去": ("上海比过去变得更漂亮了。", "Thượng Hải đã trở nên đẹp hơn trước.", 28, None),
    "变": ("上海比过去变得更漂亮了。", "Thượng Hải đã trở nên đẹp hơn trước.", 28, None),
    "更": ("上海比过去变得更漂亮了。", "Thượng Hải đã trở nên đẹp hơn trước.", 28, None),
    "漂亮": ("上海比过去变得更漂亮了。", "Thượng Hải đã trở nên đẹp hơn trước.", 28, None),
    "冬天": ("上海的冬天是不是比北京暖和一点儿？", "Mùa đông ở Thượng Hải có ấm hơn Bắc Kinh một chút không?", 33, None),
    "暖和": ("上海的冬天是不是比北京暖和一点儿？", "Mùa đông ở Thượng Hải có ấm hơn Bắc Kinh một chút không?", 33, None),
    "可是": ("可是，我看天气预报，上海的气温比北京高得多。", "Nhưng theo dự báo thời tiết tôi xem, nhiệt độ Thượng Hải cao hơn Bắc Kinh nhiều.", 42, None),
    "暖气": ("上海人家里没有暖气？", "Nhà người Thượng Hải không có hệ thống sưởi à?", 47, None),
    "天气": ("可是，我看天气预报，上海的气温比北京高得多。", "Nhưng theo dự báo thời tiết tôi xem, nhiệt độ Thượng Hải cao hơn Bắc Kinh nhiều.", 42, None),
    "预报": ("可是，我看天气预报，上海的气温比北京高得多。", "Nhưng theo dự báo thời tiết tôi xem, nhiệt độ Thượng Hải cao hơn Bắc Kinh nhiều.", 42, None),
    "气温": ("上海的气温比北京高好几度。", "Nhiệt độ Thượng Hải cao hơn Bắc Kinh vài độ.", 42, None),
    "高": ("上海的气温比北京高得多。", "Nhiệt độ Thượng Hải cao hơn Bắc Kinh nhiều.", 42, None),
    "度": ("上海的气温比北京高好几度。", "Nhiệt độ Thượng Hải cao hơn Bắc Kinh vài độ.", 43, None),
    "屋子": ("屋子里没有暖气。", "Trong phòng không có hệ thống sưởi.", 43, None),
    "感觉": ("所以感觉还没有北京暖和。", "Vì vậy cảm thấy vẫn không ấm bằng Bắc Kinh.", 45, "Đã bỏ phần ký tự rác OCR ở đầu câu ví dụ."),
    "家庭": ("一般的家庭没有，不过旅馆和饭店里有。", "Gia đình bình thường thì không có, nhưng khách sạn và nhà hàng thì có.", 48, None),
    "旅馆": ("一般的家庭没有，不过旅馆和饭店里有。", "Gia đình bình thường thì không có, nhưng khách sạn và nhà hàng thì có.", 48, None),
    "饭店": ("一般的家庭没有，不过旅馆和饭店里有。", "Gia đình bình thường thì không có, nhưng khách sạn và nhà hàng thì có.", 48, None),
    "迷": ("我是个音乐迷，光CD就有好几百张呢。", "Tôi là người mê âm nhạc, riêng CD đã có tới mấy trăm đĩa.", 56, None),
    "光": ("我是个音乐迷，光CD就有好几百张呢。", "Tôi là người mê âm nhạc, riêng CD đã có tới mấy trăm đĩa.", 56, None),
    "也许": ("我也很喜欢音乐，也许比你更喜欢。", "Tôi cũng rất thích âm nhạc, có lẽ còn thích hơn bạn.", 58, None),
    "古典": ("你喜欢古典音乐还是喜欢现代音乐？", "Bạn thích nhạc cổ điển hay nhạc hiện đại?", 58, None),
    "现代": ("你喜欢古典音乐还是喜欢现代音乐？", "Bạn thích nhạc cổ điển hay nhạc hiện đại?", 59, None),
    "世界": ("我喜欢听世界名曲，还喜欢听民歌。", "Tôi thích nghe các danh khúc thế giới, còn thích nghe dân ca.", 258, None),
    "名曲": ("我喜欢听世界名曲，还喜欢听民歌。", "Tôi thích nghe các danh khúc thế giới, còn thích nghe dân ca.", 259, None),
    "民歌": ("我喜欢听世界名曲，还喜欢听民歌。", "Tôi thích nghe các danh khúc thế giới, còn thích nghe dân ca.", 261, None),
    "流行": ("你喜欢流行歌曲吗？", "Bạn có thích nhạc thịnh hành không?", 262, None),
    "歌曲": ("你喜欢流行歌曲吗？", "Bạn có thích các bài hát thịnh hành không?", 263, None),
    "年轻": ("可能没有你们年轻人那么喜欢。", "Có lẽ không thích bằng những người trẻ như các bạn.", 264, None),
    "歌词": ("流行歌曲的歌词没有民歌写得好。", "Lời nhạc thịnh hành viết không hay bằng dân ca.", 265, None),
    "有些": ("有些流行歌曲的歌词写得还是不错的。", "Lời của một số bài hát thịnh hành được viết khá hay.", 266, None),
    "遥远": ("“在那遥远的地方……”，写得多好！", "“Ở nơi xa xôi ấy...”, viết hay biết bao!", 72, "OCR ghi nhầm 各远; đã phục hồi thành 遥远 theo ngữ cảnh bài hát."),
}


WORD_GROUPS = [
    ["变化", "暑假", "还", "过去", "变", "增加", "更"],
    ["城市", "人口", "建筑", "家庭", "旅馆", "饭店", "屋子"],
    ["比", "最", "更", "高", "度", "气温", "暖和", "漂亮"],
    ["冬天", "暖和", "暖气", "天气", "预报", "气温", "高", "度", "屋子", "感觉"],
    ["还", "比", "最", "更", "可是", "光", "也许", "有些"],
    ["迷", "光", "也许", "古典", "现代", "世界", "名曲", "民歌", "流行", "歌曲", "年轻", "歌词", "有些", "遥远"],
]

GRAMMAR_LINES = [460, 508, 528, 546, 580, 600]
GRAMMAR_RELATED = [
    ["比", "高", "暖和", "更"],
    ["比", "更", "高", "漂亮"],
    ["比", "高", "暖和"],
    ["比", "高", "暖和"],
    ["比", "度", "高", "气温"],
    ["漂亮", "歌词", "民歌", "歌曲"],
]

PINYIN_TERMS = set(WORD_EXAMPLES) | {
    "今年", "那儿", "上海", "北京", "中国", "没有", "不过", "不少", "一点儿", "所以",
    "一般", "喜欢", "音乐", "你们", "年轻人", "那么", "觉得", "不错", "地方", "飞机",
    "汽车", "弟弟", "火车", "麦克", "罗兰", "分钟", "这儿", "风景", "公园", "感觉",
    "家庭", "旅馆", "饭店", "上海人", "人家", "我们", "这么",
}

PINYIN_OVERRIDES = {"名曲": "míngqǔ"}


def pinyin_word(text: str) -> str:
    if text in PINYIN_OVERRIDES:
        return PINYIN_OVERRIDES[text]
    parts = lazy_pinyin(text, style=Style.TONE, neutral_tone_with_five=False, errors=lambda value: list(value))
    return "".join(parts)


def pinyin_sentence(text: str) -> str:
    tokens = []
    index = 0
    while index < len(text):
        char = text[index]
        if re.match(r"[\u4e00-\u9fff]", char):
            matches = [term for term in PINYIN_TERMS if text.startswith(term, index)]
            token = max(matches, key=len) if matches else char
            tokens.append(token)
            index += len(token)
        elif char.isascii() and char.isalnum():
            end = index + 1
            while end < len(text) and text[end].isascii() and text[end].isalnum():
                end += 1
            tokens.append(text[index:end])
            index = end
        else:
            tokens.append(char)
            index += 1

    rendered = []
    for token in tokens:
        if re.fullmatch(r"[\u4e00-\u9fff]+", token):
            if token in PINYIN_OVERRIDES:
                rendered.append(PINYIN_OVERRIDES[token])
                continue
            if token == "那儿":
                rendered.append("nàr")
                continue
            if token == "这儿":
                rendered.append("zhèr")
                continue
            if token == "一点儿":
                rendered.append("yìdiǎnr")
                continue
            parts = lazy_pinyin(token, style=Style.TONE, neutral_tone_with_five=False)
            for char_index, char in enumerate(token):
                if char == "得":
                    parts[char_index] = "de"
                elif char == "地" and token != "地方":
                    parts[char_index] = "de"
                elif char == "了":
                    parts[char_index] = "le"
                elif char == "还":
                    parts[char_index] = "hái"
            rendered.append("".join(parts))
        else:
            rendered.append(token)

    result = " ".join(rendered)
    replacements = {"，": ",", "。": ".", "？": "?", "！": "!", "：": ":", "；": ";"}
    for source, target in replacements.items():
        result = result.replace(" " + source, target).replace(source, target)
    result = re.sub(r"\s+([,.?!:;])", r"\1", result)
    if result:
        result = result[0].upper() + result[1:]
    return result


def nearest_group_words(word: str, limit: int = 3) -> list[str]:
    candidates = []
    for group in WORD_GROUPS:
        if word not in group:
            continue
        index = group.index(word)
        ranked = sorted(
            ((abs(other_index - index), other_index, other) for other_index, other in enumerate(group) if other != word),
            key=lambda item: (item[0], item[1]),
        )
        candidates.extend(other for _, _, other in ranked)
    result = []
    for candidate in candidates:
        if candidate not in result:
            result.append(candidate)
        if len(result) == limit:
            break
    return result


def build_payload() -> dict:
    lesson = LESSONS[1]
    word_ids = {spec["zh"]: f"bai01_w{index:03d}" for index, spec in enumerate(lesson["words"], 1)}
    entries = []

    for index, spec in enumerate(lesson["words"], 1):
        word = spec["zh"]
        example_zh, example_vi, source_line, ocr_note = WORD_EXAMPLES[word]
        related_names = nearest_group_words(word)
        related_ids = [word_ids[name] for name in related_names]
        if word in {"比", "高", "暖和", "更", "漂亮"} and len(related_ids) < 4:
            related_ids.append("bai01_g001")
        confidence = "medium" if ocr_note and "ghi nhầm" in ocr_note else "high"
        entries.append({
            "id": f"bai01_w{index:03d}",
            "bai": 1,
            "type": "word",
            "word_zh": word,
            "pinyin": spec["pinyin"] or pinyin_word(word),
            "word_type": spec["word_type"],
            "meaning_vi": spec["vi"],
            "meaning_en": spec["en"],
            "example_zh": example_zh,
            "example_pinyin": pinyin_sentence(example_zh),
            "example_vi": example_vi,
            "example_source": "document",
            "grammar_note": None,
            "related_words": related_ids[:4],
            "tags": type_tags(spec["word_type"]),
            "source_line": source_line,
            "confidence": confidence,
            "note": ocr_note,
        })

    for index, spec in enumerate(lesson["grammar"], 1):
        examples = [
            {"zh": zh, "pinyin": pinyin_sentence(zh), "vi": vi, "source": "document"}
            for zh, vi in spec["examples"]
        ]
        entries.append({
            "id": f"bai01_g{index:03d}",
            "bai": 1,
            "type": "grammar",
            "grammar_title_zh": spec["title_zh"],
            "grammar_title_vi": spec["title_vi"],
            "structure": spec["structure"],
            "explanation_vi": spec["explanation_vi"],
            "explanation_zh": spec["explanation_zh"],
            "examples": examples,
            "related_words": [word_ids[word] for word in GRAMMAR_RELATED[index - 1]],
            "tags": ["ngu_phap"],
            "source_line": GRAMMAR_LINES[index - 1],
            "confidence": "high",
            "note": None,
        })

    entries.append({
        "id": "bai01_p001",
        "bai": 1,
        "type": "phrase",
        "phrase_zh": "怎么说呢",
        "pinyin": "Zěnme shuō ne",
        "meaning_vi": "nói thế nào nhỉ; khó mà nói",
        "meaning_en": "how should I put it",
        "usage_note": "Dùng khi người nói thấy khó diễn đạt hoặc chưa biết nên nói thế nào.",
        "related_words": [word_ids["也许"], word_ids["感觉"], word_ids["还"]],
        "tags": ["mau_cau", "khau_ngu"],
        "source_line": 65,
        "confidence": "high",
        "note": None,
    })

    word_entries = [entry for entry in entries if entry["type"] == "word"]
    example_stats = {
        "from_document": sum(entry["example_source"] == "document" for entry in word_entries),
        "ai_inferred": sum(entry["example_source"] == "ai_inferred" for entry in word_entries),
        "missing": sum(not entry["example_zh"] for entry in word_entries),
    }
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return {
        "metadata": {
            "bai": 1,
            "title_zh": lesson["title_zh"],
            "title_vi": lesson["title_vi"],
            "title_source": "ai_inferred",
            "source_file": "data/_extracted/bai/bai01.txt",
            "total_entries": len(entries),
            "word_count": len(word_entries),
            "grammar_count": sum(entry["type"] == "grammar" for entry in entries),
            "phrase_count": sum(entry["type"] == "phrase" for entry in entries),
            "example_stats": example_stats,
            "generated_at": generated_at,
            "version": "2.0",
        },
        "entries": entries,
    }


def validate(payload: dict, source_line_count: int) -> None:
    entries = payload["entries"]
    ids = [entry["id"] for entry in entries]
    assert len(ids) == len(set(ids)), "Duplicate IDs"
    id_set = set(ids)
    assert payload["metadata"]["total_entries"] == len(entries)
    assert payload["metadata"]["example_stats"]["missing"] == 0
    assert all("page" not in entry for entry in entries), "Legacy page field found"
    assert all(1 <= entry["source_line"] <= source_line_count for entry in entries)

    for entry in entries:
        assert 2 <= len(entry["related_words"]) <= 4, f"Bad related_words count: {entry['id']}"
        assert all(related in id_set for related in entry["related_words"]), f"Dangling link: {entry['id']}"
        assert not re.search(r"[\uac00-\ud7af]", json.dumps(entry, ensure_ascii=False)), f"Korean: {entry['id']}"
        if entry["type"] == "word":
            assert entry["example_zh"] and entry["example_pinyin"] and entry["example_vi"]
            assert entry["example_source"] in {"document", "ai_inferred"}

    expected_word_ids = [f"bai01_w{index:03d}" for index in range(1, 42)]
    expected_grammar_ids = [f"bai01_g{index:03d}" for index in range(1, 7)]
    assert [entry["id"] for entry in entries if entry["type"] == "word"] == expected_word_ids
    assert [entry["id"] for entry in entries if entry["type"] == "grammar"] == expected_grammar_ids
    assert [entry["id"] for entry in entries if entry["type"] == "phrase"] == ["bai01_p001"]


def main() -> None:
    source_path = ROOT / "data" / "_extracted" / "bai" / "bai01.txt"
    source_lines = source_path.read_text(encoding="utf-8", errors="replace").splitlines()
    payload = build_payload()
    validate(payload, len(source_lines))
    output_path = ROOT / "data" / "glossary_bai01.v2.tmp"
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reparsed = json.loads(output_path.read_text(encoding="utf-8"))
    validate(reparsed, len(source_lines))
    print(json.dumps(reparsed["metadata"], ensure_ascii=False))


if __name__ == "__main__":
    main()
