from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".codex_deps"))

from pypinyin import Style, lazy_pinyin  # noqa: E402


TEMP_DIR = ROOT / "data" / "_quiz_v2_tmp"
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
LEVEL_DISTRIBUTION = {"recall": 13, "understand": 6, "apply": 7, "synthesize": 4}
MCQ_TYPES = set(list(TYPE_DISTRIBUTION)[:8])
TYPED_TYPES = set(TYPE_DISTRIBUTION) - MCQ_TYPES
OPTION_IDS = ["A", "B", "C", "D"]
HANGUL = re.compile(r"[\uac00-\ud7af]")
HAN = re.compile(r"[\u4e00-\u9fff]")
PUNCTUATION = re.compile(r"[\s，。？！、；：‘’“”《》,.?!;:'\"()（）]")


TYPE_NAMES = {
    "名": "danh từ", "动": "động từ", "形": "tính từ", "副": "phó từ",
    "介": "giới từ", "连": "liên từ", "助": "trợ từ", "代": "đại từ",
    "量": "lượng từ", "数": "số từ", "惯用语": "quán ngữ", "补语": "bổ ngữ",
    "动、名": "động từ và danh từ", "名、形": "danh từ và tính từ",
    "形、动": "tính từ và động từ", "形、副": "tính từ và phó từ",
}

COMMON_KEYWORDS = {
    "我们": "chúng tôi; chúng ta", "我": "tôi", "你": "bạn", "他": "anh ấy", "她": "cô ấy",
    "大家": "mọi người", "今天": "hôm nay", "明天": "ngày mai", "昨天": "hôm qua",
    "北京": "Bắc Kinh", "上海": "Thượng Hải", "中国": "Trung Quốc", "老师": "giáo viên",
    "医生": "bác sĩ", "学校": "trường học", "已经": "đã", "正在": "đang", "没有": "không có; không bằng",
    "这里": "ở đây", "那里": "ở đó", "这儿": "ở đây", "那儿": "ở đó", "什么": "gì",
    "不但": "không những", "而且": "mà còn", "一样": "giống nhau", "跟": "với; như",
    "以后": "sau khi", "以前": "trước đây", "快要": "sắp", "就要": "sắp; liền",
    "差点儿": "suýt", "一点儿": "một chút", "因为": "bởi vì", "所以": "cho nên",
    "第一": "thứ nhất", "一次": "một lần", "两次": "hai lần", "两遍": "hai lượt",
    "门口": "cửa; cổng", "墙上": "trên tường", "地上": "trên mặt đất", "书架": "giá sách",
    "照片": "ảnh", "眼睛": "mắt", "钥匙": "chìa khóa", "汽车": "ô tô", "自行车": "xe đạp",
    "冬天": "mùa đông", "夏天": "mùa hè", "秋天": "mùa thu", "春天": "mùa xuân",
    "天气": "thời tiết", "旅行": "du lịch", "比赛": "trận đấu", "衣服": "quần áo",
    "护照": "hộ chiếu", "图书馆": "thư viện", "会议厅": "phòng hội nghị",
    "同学们": "các bạn học", "努力": "nỗ lực", "学习": "học tập", "方法": "phương pháp",
    "感冒": "cảm cúm", "长城": "Vạn Lý Trường Thành", "照相": "chụp ảnh",
    "新书": "sách mới", "看到": "nhìn thấy", "到了": "đã đến",
    "北京的": "của Bắc Kinh", "努力地": "một cách nỗ lực", "你的": "của bạn",
    "洗好": "giặt xong", "了吗": "rồi chưa", "来中国以后": "sau khi đến Trung Quốc",
    "得过": "đã từng mắc", "三次": "ba lần",
    "着急": "sốt ruột; lo lắng",
    "是": "là", "的": "trợ từ kết cấu", "了": "rồi", "过": "đã từng", "地": "trợ từ trạng ngữ",
    "一": "vừa; hễ", "就": "liền; thì", "在": "ở; tại", "着": "đang; đạt kết quả",
    "好": "xong; tốt", "成": "thành", "第": "thứ", "次": "lần", "遍": "lượt trọn vẹn",
}


GRAMMAR_ALT = {
    "bai02_g001": "那件毛衣的价钱跟这件一样。",
    "bai02_g002": "他会说英语，也会说法语。",
    "bai03_g001": "树叶黄了。",
    "bai03_g002": "我不再回国了。",
    "bai03_g003": "再过两个月就放寒假了。",
    "bai03_g004": "她高兴地说姐姐下个月结婚。",
    "bai03_g005": "这里下雪了。",
    "bai04_g001": "要上课了，快进来吧。",
    "bai05_g001": "以前我到过中国。",
    "bai05_g002": "我看过这个电影两遍。",
    "bai05_g003": "这本书我已经看了两遍。",
    "bai05_g004": "这一课是第四十一课。",
    "bai06_g001": "我们从美国来的。",
    "bai06_g002": "今天一下课我就去看你。",
    "bai06_g003": "你别着急，慢慢儿说。",
    "bai07_g001": "你喜欢足球吗？",
    "bai07_g002": "你把我的词典放在哪儿了？",
    "bai07_g003": "你给我找着护照了没有？",
    "bai07_g004": "你洗好衣服了吗？",
    "bai07_g005": "他把这篇故事翻译成英语了。",
    "bai08_g001": "我的眼镜被摔坏了。",
    "bai08_g002": "每张照片都照得很好。",
    "bai08_g003": "有汽车的人越来越多。",
    "bai08_g004": "我今天早上差一点儿迟到。",
    "bai09_g001": "她从学校走出去了。",
    "bai09_g002": "我看见他进图书馆去了。",
    "bai09_g003": "同学们都跑了出去。",
    "bai10_g001": "墙上正贴着红双喜字。",
    "bai10_g002": "教室的门没有开着。",
    "bai10_g003": "她在前边站着讲话。",
    "bai10_g004": "里边正在上课呢。",
}

GRAMMAR_SAMPLE_OVERRIDE = {
    "bai03_g005": {"zh": "这里已经下雪了。", "vi": "Ở đây đã có tuyết rơi rồi."},
    "bai05_g004": {"zh": "这是第四十一课。", "vi": "Đây là bài thứ bốn mươi mốt."},
}


def normalize(value: str) -> str:
    return PUNCTUATION.sub("", value.lower())


def han_length(value: str) -> int:
    return len(HAN.findall(value))


def tone_number(syllable: str) -> int:
    marks = {"\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4}
    normalized = unicodedata.normalize("NFD", syllable)
    return next((marks[char] for char in normalized if char in marks), 0)


def pinyin_text(value: str, lexicon: list[str] | set[str] | None = None) -> str:
    parts = lazy_pinyin(
        value,
        style=Style.TONE,
        neutral_tone_with_five=False,
        errors=lambda chars: list(chars),
    )
    for index, char in enumerate(value):
        previous = value[index - 1] if index > 0 else ""
        two_back = value[index - 2] if index > 1 else ""
        following = value[index + 1] if index + 1 < len(value) else ""
        if char == "了":
            parts[index] = "le"
        elif char == "过" and following != "去" and previous != "经":
            parts[index] = "guo"
        elif char == "地" and following not in {"上", "下", "方", "铁"}:
            parts[index] = "de"
        elif char == "得":
            parts[index] = "dé" if following in {"了", "过"} else "de"
        elif char == "着":
            is_result = following == "急" or previous in {"找", "睡"} or (previous == "不" and two_back in {"找", "睡"})
            parts[index] = "zháo" if is_result else "zhe"
    for index, char in enumerate(value):
        if char not in {"一", "不"} or index + 1 >= len(value):
            continue
        previous = value[index - 1] if index > 0 else ""
        next_tone = tone_number(parts[index + 1])
        if char == "不" and next_tone == 4:
            parts[index] = "bú"
        elif char == "一" and previous not in "第零一二三四五六七八九十百千万":
            parts[index] = "yí" if next_tone == 4 else "yì"

    terms = {
        term for term in COMMON_KEYWORDS
        if len(term) <= 4 and not term.endswith(("的", "地"))
    }
    terms.difference_update({"得过", "一次", "两次", "三次", "两遍", "第一"})
    if lexicon:
        terms.update(term for term in lexicon if term and "…" not in term)
    tokens = []
    index = 0
    while index < len(value):
        char = value[index]
        if HAN.fullmatch(char):
            matches = [term for term in terms if value.startswith(term, index)]
            token = max(matches, key=len) if matches else char
            tokens.append("".join(parts[index:index + len(token)]))
            index += len(token)
        else:
            tokens.append(char)
            index += 1
    rendered = " ".join(tokens)
    for source, target in {" ，": ",", " 。": ".", " ？": "?", " ！": "!", " ：": ":", " ；": ";"}.items():
        rendered = rendered.replace(source, target)
    rendered = re.sub(r"\s+([,.?!:;])", r"\1", rendered)
    rendered = rendered.replace("nàér", "nàr").replace("zhèér", "zhèr").replace("diǎnér", "diǎnr")
    return rendered[:1].upper() + rendered[1:] if rendered else rendered


def source(line: int, context: str, bai: int) -> dict:
    return {"bai": bai, "source_line": line, "context": context}


def chunks(items: list[dict], size: int = 4) -> list[list[dict]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def option_pack(correct_text: str, wrong: list[tuple[str, str]], position: int) -> tuple[list[dict], str, dict[str, str]]:
    unique_wrong = []
    seen = {correct_text}
    for text, reason in wrong:
        if text not in seen:
            unique_wrong.append((text, reason))
            seen.add(text)
        if len(unique_wrong) == 3:
            break
    assert len(unique_wrong) == 3, (correct_text, wrong)
    values: list[tuple[str, str | None]] = [(text, reason) for text, reason in unique_wrong]
    values.insert(position % 4, (correct_text, None))
    options = [{"id": option_id, "text": text} for option_id, (text, _) in zip(OPTION_IDS, values)]
    correct_option = OPTION_IDS[position % 4]
    why_wrong = {
        option_id: reason
        for option_id, (_, reason) in zip(OPTION_IDS, values)
        if reason is not None
    }
    return options, correct_option, why_wrong


def related_terms_in_sentence(sentence: str, words: list[dict]) -> list[dict]:
    return sorted(
        [
            word for word in words
            if "…" not in word["word_zh"]
            and word["word_zh"] in sentence
            and not (
                word["word_zh"] == "还"
                and word["pinyin"] == "huán"
                and "还给" not in sentence
                and "归还" not in sentence
            )
        ],
        key=lambda item: (-len(item["word_zh"]), item["id"]),
    )


def keyword_items(sentence: str, words: list[dict], minimum: int = 2) -> list[dict]:
    result = []
    used = set()
    for word in related_terms_in_sentence(sentence, words):
        term = word["word_zh"]
        if term not in used and not any(term in existing or existing in term for existing in used):
            result.append({"zh": term, "pinyin": word["pinyin"], "meaning": word["meaning_vi"].split(";")[0]})
            used.add(term)
        if len(result) == 4:
            return result
    for term in sorted(COMMON_KEYWORDS, key=len, reverse=True):
        if term in sentence and term not in used and not any(term in existing or existing in term for existing in used):
            result.append({"zh": term, "pinyin": pinyin_text(term, [term]).rstrip("."), "meaning": COMMON_KEYWORDS[term]})
            used.add(term)
        if len(result) >= max(minimum, 4):
            break
    if len(result) < minimum:
        han_chars = [char for char in sentence if HAN.fullmatch(char) and char not in used]
        for char in han_chars:
            result.append({"zh": char, "pinyin": pinyin_text(char, [char]), "meaning": "từ khóa trong câu"})
            used.add(char)
            if len(result) >= minimum:
                break
    return result[:4]


def make_alt_zh(sentence: str) -> str | None:
    stripped = sentence.strip()
    punctuation = "？" if stripped.endswith("？") else "！" if stripped.endswith("！") else "。"
    core = stripped.rstrip("。？！")
    for prefix in ("同学们", "老师们", "孩子们", "我们", "大家", "他们", "她们", "我", "他", "她", "你"):
        if core.startswith(prefix) and len(core) > len(prefix) + 3:
            return core[len(prefix):] + punctuation
    replacements = (("已经", ""), ("正在", "在"), ("有很多", "有不少"), ("差一点儿", "差点儿"), ("这里", "这儿"), ("那里", "那儿"))
    for source_text, target_text in replacements:
        if source_text in core:
            candidate = core.replace(source_text, target_text, 1) + punctuation
            if normalize(candidate) != normalize(sentence):
                return candidate
    if "很" in core:
        return core.replace("很", "非常", 1) + punctuation
    return None


def make_alt_vi(sentence: str) -> str:
    replacements = (
        ("Tôi ", "Mình "), ("Anh ấy ", "Anh ta "), ("Cô ấy ", "Cô ta "),
        ("Chúng tôi ", "Bọn tôi "), ("Ngày mai ", "Vào ngày mai, "),
        ("Hôm nay ", "Trong hôm nay, "), ("Ở đây ", "Tại đây, "),
    )
    for source_text, target_text in replacements:
        if sentence.startswith(source_text):
            return target_text + sentence[len(source_text):]
    if sentence.endswith("."):
        return sentence[:-1] + " đấy."
    return sentence + " đấy"


def grammar_plan(grammars: list[dict]) -> dict[str, list[str]]:
    ids = [grammar["id"] for grammar in grammars]
    plan = {key: [] for key in ("q16", "q17", "q18", "q19", "t0", "t1", "t2", "t3", "q30")}
    if len(ids) == 1:
        plan.update({"q16": [ids[0]], "q17": [ids[0]], "t0": [ids[0]]})
    elif len(ids) == 2:
        plan.update({"q16": [ids[0]], "q17": [ids[1]], "q18": [ids[0]], "q19": [ids[1]]})
    elif len(ids) == 3:
        plan.update({"q16": [ids[0]], "q17": [ids[1]], "q18": [ids[2]], "q19": [ids[0]], "t0": [ids[1]], "t1": [ids[2]]})
    elif len(ids) == 4:
        plan.update({"q16": [ids[0]], "q17": [ids[1]], "q18": [ids[2]], "q19": [ids[3]], "t0": [ids[0]], "t1": [ids[1]], "t2": [ids[2]], "t3": [ids[3]]})
    elif len(ids) == 5:
        plan.update({"q16": [ids[0], ids[4]], "q17": [ids[1]], "q18": [ids[2]], "q19": [ids[3]], "t0": [ids[4]], "t1": [ids[0]], "t2": [ids[1]], "t3": [ids[2]], "q30": [ids[3]]})
    return plan


def grammar_sample(grammar: dict) -> dict:
    if grammar["id"] in GRAMMAR_SAMPLE_OVERRIDE:
        override = GRAMMAR_SAMPLE_OVERRIDE[grammar["id"]]
        return {"zh": override["zh"], "vi": override["vi"], "pinyin": pinyin_text(override["zh"])}
    candidates = [example for example in grammar["examples"] if 5 <= han_length(example["zh"]) <= 15]
    assert candidates, grammar["id"]
    return candidates[0]


def segment_sentence(sentence: str, words: list[dict]) -> list[str]:
    clean = re.sub(r"[。？！]", "", sentence)
    lexicon = {word["word_zh"] for word in words if "…" not in word["word_zh"]}
    lexicon.update(term for term in COMMON_KEYWORDS if len(term) > 1)
    parts = []
    index = 0
    while index < len(clean):
        if clean[index] in "，、；：":
            index += 1
            continue
        matches = [term for term in lexicon if clean.startswith(term, index)]
        if matches:
            token = max(matches, key=len)
            parts.append(token)
            index += len(token)
        else:
            parts.append(clean[index])
            index += 1
    while len(parts) > 8:
        first = parts.pop(0)
        parts[0] = first + parts[0]
    if len(parts) < 3:
        midpoint = max(1, len(clean) // 2)
        parts = [clean[:midpoint], clean[midpoint:-1], clean[-1:]]
    return parts


def build_lesson(number: int, generated_at: str) -> dict:
    glossary_path = ROOT / "data" / f"glossary_bai{number:02d}.json"
    text_path = ROOT / "data" / "_extracted" / "bai" / f"bai{number:02d}.txt"
    glossary = json.loads(glossary_path.read_text(encoding="utf-8"))
    source_lines = text_path.read_text(encoding="utf-8", errors="replace").splitlines()
    words = [entry for entry in glossary["entries"] if entry["type"] == "word"]
    grammars = [entry for entry in glossary["entries"] if entry["type"] == "grammar"]
    phrases = [entry for entry in glossary["entries"] if entry["type"] == "phrase"]
    lesson_lexicon = {word["word_zh"] for word in words}
    grammar_by_id = {entry["id"]: entry for entry in grammars}
    coverage_chunks = chunks(words)
    questions: list[dict] = []
    plan = grammar_plan(grammars)

    def add_mcq(
        qtype: str, level: str, question_vi: str, correct_text: str,
        wrong: list[tuple[str, str]], position: int, why_correct: str,
        keyword_tip: str, concept: str, related: list[str], line: int,
        context: str, difficulty: int, **extra: object,
    ) -> None:
        options, correct_option, why_wrong = option_pack(correct_text, wrong, position)
        questions.append({
            "id": f"quiz_bai{number:02d}_{len(questions) + 1:03d}", "bai": number,
            "level": level, "type": qtype, "question_vi": question_vi, **extra,
            "options": options, "correct_option": correct_option,
            "explanation": {"why_correct": why_correct, "why_others_wrong": why_wrong, "keyword_tip": keyword_tip, "concept": concept},
            "related_glossary": related, "source": source(line, context, number),
            "difficulty_score": difficulty, "confidence": "high", "note": None,
        })

    def group_for(slot: int) -> list[dict]:
        return coverage_chunks[slot % len(coverage_chunks)]

    def distractor_words(target: dict, field: str, preferred: list[dict]) -> list[dict]:
        result = []
        for candidate in preferred + words:
            if candidate["id"] != target["id"] and candidate[field] != target[field] and candidate not in result:
                result.append(candidate)
            if len(result) == 3:
                break
        return result

    for slot in range(5):
        group = group_for(slot)
        target = group[0]
        distractors = distractor_words(target, "meaning_vi", group[1:])
        add_mcq(
            "mcq_meaning_zh_to_vi", "recall", f'“{target["word_zh"]}” có nghĩa là gì?',
            target["meaning_vi"],
            [(item["meaning_vi"], f'Đây là nghĩa của {item["word_zh"]}, không phải {target["word_zh"]}.') for item in distractors],
            slot, f'{target["word_zh"]} nghĩa là “{target["meaning_vi"]}”.',
            f'Gắn {target["word_zh"]} với ví dụ: {target["example_zh"]}', "Nhận biết nghĩa từ vựng",
            [item["id"] for item in group], target["source_line"], "Mục 生词", 1,
        )

    for offset, slot in enumerate(range(5, 7)):
        group = group_for(slot)
        target = group[0]
        distractors = distractor_words(target, "word_zh", group[1:])
        add_mcq(
            "mcq_meaning_vi_to_zh", "recall", f'Từ nào có nghĩa là “{target["meaning_vi"]}”?',
            target["word_zh"],
            [(item["word_zh"], f'{item["word_zh"]} nghĩa là {item["meaning_vi"]}.') for item in distractors],
            offset + 1, f'{target["word_zh"]} là từ tương ứng với nghĩa “{target["meaning_vi"]}”.',
            f'Nhớ câu: {target["example_zh"]}', "Gợi nhớ chữ Hán từ nghĩa Việt",
            [item["id"] for item in group], target["source_line"], "Mục 生词", 1,
        )

    for offset, slot in enumerate(range(7, 9)):
        group = group_for(slot)
        target = group[0]
        distractors = distractor_words(target, "pinyin", group[1:])
        add_mcq(
            "mcq_pinyin", "recall", f'Pinyin đúng của “{target["word_zh"]}” là gì?',
            target["pinyin"],
            [(item["pinyin"], f'Đây là pinyin của {item["word_zh"]}.') for item in distractors],
            offset + 2, f'{target["word_zh"]} đọc là {target["pinyin"]}.',
            f'Đọc cùng nghĩa “{target["meaning_vi"]}”.', "Pinyin có dấu thanh",
            [item["id"] for item in group], target["source_line"], "Mục 生词", 2,
        )

    type_values = list(TYPE_NAMES)
    for offset, slot in enumerate(range(9, 11)):
        group = group_for(slot)
        target = group[0]
        wrong_types = [value for value in type_values if value != target["word_type"]][:3]
        add_mcq(
            "mcq_word_type", "recall", f'“{target["word_zh"]}” thuộc từ loại nào?',
            f'{target["word_type"]} ({TYPE_NAMES.get(target["word_type"], "từ loại trong sách")})',
            [(f'{value} ({TYPE_NAMES[value]})', f'{value} không phải ký hiệu từ loại của {target["word_zh"]} trong bài.') for value in wrong_types],
            offset, f'Trong bảng từ mới, {target["word_zh"]} được ghi là {target["word_type"]}.',
            f'Đặt từ vào câu: {target["example_zh"]}', "Nhận diện từ loại",
            [item["id"] for item in group], target["source_line"], "Mục 生词", 2,
        )

    fill_candidates = [
        word for word in words
        if "…" not in word["word_zh"] and word["word_zh"] in word["example_zh"] and 5 <= han_length(word["example_zh"]) <= 18
    ]
    used_fill = set()
    for offset, slot in enumerate(range(11, 15)):
        group = group_for(slot)
        candidate_order = group + fill_candidates
        target = next(word for word in candidate_order if word["id"] not in used_fill and word in fill_candidates)
        used_fill.add(target["id"])
        sentence = target["example_zh"].replace(target["word_zh"], "___", 1)
        preferred = [word for word in group if word["id"] != target["id"]]
        distractors = distractor_words(target, "word_zh", preferred)
        add_mcq(
            "mcq_fill_blank", "apply", f"Chọn từ thích hợp: {sentence}", target["word_zh"],
            [(item["word_zh"], f'{item["word_zh"]} nghĩa là {item["meaning_vi"]}, không phù hợp chỗ trống.') for item in distractors],
            offset + 1, f'{target["word_zh"]} khôi phục đúng câu “{target["example_zh"]}”.',
            f'Dựa vào nghĩa “{target["meaning_vi"]}” và ngữ cảnh quanh chỗ trống.', "Điền từ theo ngữ cảnh",
            list(dict.fromkeys([target["id"], *[item["id"] for item in group]])), target["source_line"], "Ví dụ từ vựng trong bài", 3,
            sentence_zh=sentence,
        )

    # Question 16: identify a grammar structure.
    grammar16 = grammar_by_id[plan["q16"][0]]
    structure_distractors = []
    for grammar in grammars:
        if grammar["id"] != grammar16["id"] and grammar["structure"] != grammar16["structure"]:
            structure_distractors.append((grammar["structure"], f'Đây là cấu trúc của {grammar["grammar_title_vi"]}.'))
    generic_structures = ["主语 + 很 + 名词", "动词 + 主语 + 宾语", "形容词 + 把 + 名词"]
    structure_distractors.extend((value, "Trật tự này không biểu đạt điểm ngữ pháp được hỏi.") for value in generic_structures)
    add_mcq(
        "mcq_grammar", "understand", f'Cấu trúc nào đúng với “{grammar16["grammar_title_zh"]}”?', grammar16["structure"],
        structure_distractors, 2, grammar16["explanation_vi"], f'Nhớ khung: {grammar16["structure"]}.',
        grammar16["grammar_title_vi"], plan["q16"], grammar16["source_line"], "Mục 语法", 3,
    )

    grammar17 = grammar_by_id[plan["q17"][0]]
    correct_example = grammar_sample(grammar17)["zh"]
    example_distractors = []
    seen_examples = {correct_example}
    for word in words:
        if word["example_zh"] not in seen_examples:
            example_distractors.append((word["example_zh"], f'Câu này minh họa từ {word["word_zh"]}, không thể hiện rõ {grammar17["grammar_title_zh"]}.'))
            seen_examples.add(word["example_zh"])
        if len(example_distractors) == 3:
            break
    add_mcq(
        "mcq_grammar", "understand", f'Câu nào minh họa đúng “{grammar17["grammar_title_zh"]}”?', correct_example,
        example_distractors, 1, f'Câu này dùng đúng cấu trúc {grammar17["structure"]}.',
        grammar17["explanation_vi"], grammar17["grammar_title_vi"], plan["q17"], grammar17["source_line"], "Mục 语法", 3,
    )

    for question_slot, plan_key, position in ((18, "q18", 3), (19, "q19", 1)):
        assigned = plan[plan_key]
        if assigned:
            grammar = grammar_by_id[assigned[0]]
            sample = grammar_sample(grammar)["zh"]
            correct_text = "Các thành phần trong cấu trúc này có thể đảo tự do mà nghĩa không đổi."
            wrong = [
                (f'Cấu trúc trọng tâm là: {grammar["structure"]}.', "Đây là cấu trúc được glossary ghi nhận."),
                (grammar["explanation_vi"], "Đây là giải thích đúng của điểm ngữ pháp."),
                (f'Ví dụ đúng: {sample}', "Đây là ví dụ đúng từ tài liệu."),
            ]
            add_mcq(
                "mcq_error_detection", "apply", f'Nhận định nào SAI về “{grammar["grammar_title_zh"]}”?',
                correct_text, wrong, position,
                "Trật tự thành phần mang chức năng ngữ pháp; không thể đảo tùy ý.",
                f'Đối chiếu với khung {grammar["structure"]}.', grammar["grammar_title_vi"], assigned,
                grammar["source_line"], "Mục 语法", 4,
            )
        else:
            group = group_for(question_slot - 4)
            target, other = group[0], group[1] if len(group) > 1 else words[1]
            correct_text = f'{target["word_zh"]} nghĩa là “{other["meaning_vi"]}”.'
            true_items = []
            for word in (target, *group[1:]):
                true_items.append((f'{word["word_zh"]} nghĩa là “{word["meaning_vi"]}”.', f'Đây là nghĩa đúng của {word["word_zh"]}.'))
                if len(true_items) == 3:
                    break
            add_mcq(
                "mcq_error_detection", "apply", "Cặp từ và nghĩa nào KHÔNG đúng?", correct_text,
                true_items, position, f'{target["word_zh"]} không có nghĩa là “{other["meaning_vi"]}”.',
                "Đối chiếu từng chữ Hán với nghĩa trong bảng 生词.", "Phát hiện lỗi dùng từ",
                [item["id"] for item in group], target["source_line"], "Mục 生词", 3,
            )

    reading_words = [word for word in words if 5 <= han_length(word["example_zh"]) <= 18]
    passage_words = reading_words[-3:] if len(reading_words) >= 3 else words[-3:]
    target = passage_words[0]
    reading_wrong = [(word["example_vi"], f'Đây là nghĩa của câu “{word["example_zh"]}”.') for word in passage_words[1:]]
    for word in words:
        if word not in passage_words:
            reading_wrong.append((word["example_vi"], f'Đây là nội dung của ví dụ về {word["word_zh"]}.'))
        if len(reading_wrong) >= 3:
            break
    passage_zh = " ".join(word["example_zh"] for word in passage_words)
    add_mcq(
        "reading_comprehension", "understand", "Ý nào đúng với câu đầu tiên của đoạn đọc?", target["example_vi"],
        reading_wrong, 0, f'Câu đầu “{target["example_zh"]}” có nghĩa là “{target["example_vi"]}”.',
        f'Chú ý từ khóa {target["word_zh"]}.', "Đọc hiểu thông tin trực tiếp",
        [word["id"] for word in passage_words], target["source_line"], "Các câu ví dụ của bài", 3,
        passage_zh=passage_zh, passage_pinyin=pinyin_text(passage_zh, lesson_lexicon),
    )

    phrase = phrases[0]
    phrase_wrong = []
    for word in words:
        phrase_wrong.append((word["meaning_vi"], f'Đây là nghĩa của {word["word_zh"]}, không phải mẫu câu {phrase["phrase_zh"]}.'))
        if len(phrase_wrong) == 3:
            break
    phrase_passage = "；".join(item["phrase_zh"] for item in phrases) + "。"
    add_mcq(
        "reading_comprehension", "understand", f'Trong ngữ cảnh bài, “{phrase["phrase_zh"]}” có nghĩa gần nhất là gì?',
        phrase["meaning_vi"], phrase_wrong, 1, phrase["usage_note"],
        f'Gắn mẫu câu với ngữ cảnh: {phrase["meaning_vi"]}.', "Đọc hiểu mẫu câu khẩu ngữ",
        [item["id"] for item in phrases], phrase["source_line"], "Mục 注释 hoặc bài khóa", 3,
        passage_zh=phrase_passage, passage_pinyin=pinyin_text(phrase_passage, lesson_lexicon),
    )

    used_translation_sentences = set()
    word_translation_candidates = [
        word for word in words
        if 5 <= han_length(word["example_zh"]) <= 15 and make_alt_zh(word["example_zh"])
    ]
    for index, plan_key in enumerate(("t0", "t1", "t2", "t3")):
        assigned = plan[plan_key]
        if assigned:
            grammar = grammar_by_id[assigned[0]]
            sample = grammar_sample(grammar)
            answer_zh, answer_vi = sample["zh"], sample["vi"]
            alt = GRAMMAR_ALT.get(grammar["id"]) or make_alt_zh(answer_zh)
            sentence_word_ids = [word["id"] for word in related_terms_in_sentence(answer_zh, words)]
            related = list(dict.fromkeys([*assigned, *sentence_word_ids]))
            line = grammar["source_line"]
            context = f'Ví dụ ngữ pháp {grammar["grammar_title_zh"]}'
            concept = grammar["grammar_title_vi"]
            why_correct = grammar["explanation_vi"]
            structure_hint = f'Dùng cấu trúc: {grammar["structure"]}.'
        else:
            candidate = next(word for word in word_translation_candidates if word["example_zh"] not in used_translation_sentences)
            answer_zh, answer_vi = candidate["example_zh"], candidate["example_vi"]
            alt = make_alt_zh(answer_zh)
            related_words = related_terms_in_sentence(answer_zh, words)
            related = [word["id"] for word in related_words] or [candidate["id"]]
            line = candidate["source_line"]
            context = "Câu ví dụ từ vựng trong bài"
            concept = f'Vận dụng từ {candidate["word_zh"]}'
            why_correct = f'Câu dùng {candidate["word_zh"]} đúng với nghĩa “{candidate["meaning_vi"]}”.'
            structure_hint = f'Dùng từ {candidate["word_zh"]} ({candidate["pinyin"]}).'
        assert alt and normalize(alt) != normalize(answer_zh), (number, answer_zh)
        used_translation_sentences.add(answer_zh)
        keywords = keyword_items(answer_zh, words)
        assert 2 <= len(keywords) <= 4, (number, answer_zh, keywords)
        questions.append({
            "id": f"quiz_bai{number:02d}_{len(questions) + 1:03d}", "bai": number,
            "level": "synthesize", "type": "translation_vi_to_zh",
            "question_vi": "Dịch câu sau sang tiếng Trung:", "source_sentence_vi": answer_vi,
            "target_language": "zh", "sample_answer": answer_zh,
            "sample_answer_pinyin": pinyin_text(answer_zh, lesson_lexicon),
            "alternative_answers": [alt], "keywords_required": keywords,
            "keywords_optional": [],
            "hints": [structure_hint, f'Bắt đầu từ khóa “{keywords[0]["zh"]}”.', f'Giữ cụm “{keywords[1]["zh"]}” đúng trật tự.'],
            "explanation": {
                "why_correct": why_correct,
                "common_mistakes": ["Bỏ từ khóa chính làm câu thiếu ý.", "Đảo vị trí thành phần khiến cấu trúc không tự nhiên."],
                "keyword_tip": " → ".join(item["zh"] for item in keywords), "concept": concept,
            },
            "related_glossary": related, "source": source(line, context, number),
            "difficulty_score": 4 if index < 2 else 5, "confidence": "high", "note": None,
        })

    zh_vi_candidates = [
        word for word in word_translation_candidates
        if word["example_zh"] not in used_translation_sentences
    ]
    for index, candidate in enumerate(zh_vi_candidates[:2]):
        answer_zh = candidate["example_zh"]
        keywords_zh = keyword_items(answer_zh, words)
        if not any(item["zh"] == candidate["word_zh"] for item in keywords_zh):
            keywords_zh.insert(0, {"zh": candidate["word_zh"], "pinyin": candidate["pinyin"], "meaning": candidate["meaning_vi"].split(";")[0]})
            keywords_zh = keywords_zh[:4]
        keywords_vi = [{"vi": item["meaning"], "zh": item["zh"]} for item in keywords_zh]
        related = list(dict.fromkeys([candidate["id"], *[word["id"] for word in related_terms_in_sentence(answer_zh, words)]]))
        questions.append({
            "id": f"quiz_bai{number:02d}_{len(questions) + 1:03d}", "bai": number,
            "level": "understand", "type": "translation_zh_to_vi",
            "question_vi": "Dịch câu sau sang tiếng Việt:", "source_sentence_zh": answer_zh,
            "source_sentence_pinyin": pinyin_text(answer_zh, lesson_lexicon), "target_language": "vi",
            "sample_answer": candidate["example_vi"], "alternative_answers": [make_alt_vi(candidate["example_vi"])],
            "keywords_required": keywords_vi, "keywords_optional": [],
            "hints": [f'{candidate["word_zh"]} = {candidate["meaning_vi"]}.', f'Chú ý trật tự cụm “{keywords_zh[0]["zh"]}”.'],
            "explanation": {
                "why_correct": f'Bản dịch giữ đúng nghĩa của {candidate["word_zh"]} và nội dung câu nguồn.',
                "common_mistakes": ["Dịch từng chữ khiến câu tiếng Việt thiếu tự nhiên.", "Bỏ mất thông tin thời gian hoặc mức độ."],
                "keyword_tip": " → ".join(item["vi"] for item in keywords_vi), "concept": f'Đọc hiểu từ {candidate["word_zh"]}',
            },
            "related_glossary": related, "source": source(candidate["source_line"], "Câu ví dụ từ vựng trong bài", number),
            "difficulty_score": 3, "confidence": "high", "note": None,
        })

    typing_candidates = sorted(words, key=lambda word: (-len(word["word_zh"]), word["id"]))
    selected_typing = []
    for candidate in typing_candidates:
        if "…" not in candidate["word_zh"] and any(unicodedata.combining(char) for char in unicodedata.normalize("NFD", candidate["pinyin"])):
            selected_typing.append(candidate)
        if len(selected_typing) == 2:
            break
    for candidate in selected_typing:
        questions.append({
            "id": f"quiz_bai{number:02d}_{len(questions) + 1:03d}", "bai": number,
            "level": "recall", "type": "typing_zh_from_pinyin",
            "question_vi": "Gõ chữ Hán tương ứng với pinyin và nghĩa sau:",
            "pinyin": candidate["pinyin"], "meaning_vi": candidate["meaning_vi"], "meaning_en": candidate["meaning_en"],
            "sample_answer": candidate["word_zh"], "alternative_answers": [],
            "keywords_required": [{"zh": candidate["word_zh"], "pinyin": candidate["pinyin"], "meaning": candidate["meaning_vi"].split(";")[0]}],
            "keywords_optional": [],
            "hints": [f'Từ gồm {len(candidate["word_zh"])} chữ Hán.', f'Ví dụ trong bài: {candidate["example_zh"]}'],
            "explanation": {
                "why_correct": f'{candidate["word_zh"]} đọc là {candidate["pinyin"]} và nghĩa là {candidate["meaning_vi"]}.',
                "common_mistakes": ["Gõ đúng âm nhưng chọn nhầm chữ đồng âm.", "Bỏ dấu thanh khi ghi nhớ pinyin."],
                "keyword_tip": f'Liên hệ {candidate["word_zh"]} với câu ví dụ trong bài.', "concept": "Nhận diện chữ Hán từ pinyin",
            },
            "related_glossary": [candidate["id"]], "source": source(candidate["source_line"], "Mục 生词", number),
            "difficulty_score": 2, "confidence": candidate["confidence"], "note": candidate["note"],
        })

    if plan["q30"]:
        grammar = grammar_by_id[plan["q30"][0]]
        sample = grammar_sample(grammar)
        reorder_zh = sample["zh"]
        reorder_vi = sample["vi"]
        sentence_word_ids = [word["id"] for word in related_terms_in_sentence(reorder_zh, words)]
        reorder_related = list(dict.fromkeys([*plan["q30"], *sentence_word_ids]))
        reorder_line = grammar["source_line"]
        reorder_context = f'Ví dụ ngữ pháp {grammar["grammar_title_zh"]}'
        reorder_concept = grammar["grammar_title_vi"]
        reorder_hint = grammar["structure"]
    else:
        candidate = next(word for word in word_translation_candidates if word["example_zh"] not in used_translation_sentences)
        reorder_zh = candidate["example_zh"]
        reorder_vi = candidate["example_vi"]
        reorder_related = [word["id"] for word in related_terms_in_sentence(reorder_zh, words)] or [candidate["id"]]
        reorder_line = candidate["source_line"]
        reorder_context = "Câu ví dụ từ vựng trong bài"
        reorder_concept = f'Trật tự câu với {candidate["word_zh"]}'
        reorder_hint = f'Đặt {candidate["word_zh"]} đúng vị trí trong câu.'
    parts = segment_sentence(reorder_zh, words)
    shuffled = parts[2:] + parts[:2]
    alt_reorder = make_alt_zh(reorder_zh)
    if not alt_reorder or normalize(alt_reorder) == normalize(reorder_zh):
        alt_reorder = make_alt_zh(reorder_zh)
    assert alt_reorder and normalize(alt_reorder) != normalize(reorder_zh), (number, reorder_zh, alt_reorder)
    reorder_keywords = keyword_items(reorder_zh, words)
    questions.append({
        "id": f"quiz_bai{number:02d}_{len(questions) + 1:03d}", "bai": number,
        "level": "apply", "type": "sentence_reorder", "question_vi": "Sắp xếp các phần sau thành câu đúng:",
        "shuffled_parts": shuffled, "sample_answer": reorder_zh, "sample_answer_pinyin": pinyin_text(reorder_zh, lesson_lexicon),
        "alternative_answers": [alt_reorder], "keywords_required": reorder_keywords, "keywords_optional": [],
        "hints": [reorder_hint, f'Ý tiếng Việt: {reorder_vi}', "Xác định chủ ngữ hoặc chủ đề trước."],
        "explanation": {
            "why_correct": "Câu mẫu sắp xếp các thành phần theo đúng trật tự ngữ pháp và giữ nguyên nghĩa nguồn.",
            "common_mistakes": ["Đặt bổ ngữ trước động từ không đúng cấu trúc.", "Đưa trợ từ sang sai vị trí."],
            "keyword_tip": " → ".join(item["zh"] for item in reorder_keywords), "concept": reorder_concept,
        },
        "related_glossary": reorder_related, "source": source(reorder_line, reorder_context, number),
        "difficulty_score": 4, "confidence": "high", "note": None,
    })

    # Any word not yet linked is attached to the MCQ slot whose coverage chunk contains it.
    linked = {item for question in questions for item in question["related_glossary"]}
    for chunk_index, chunk in enumerate(coverage_chunks):
        question = questions[min(chunk_index, 14)]
        for word in chunk:
            if word["id"] not in linked:
                question["related_glossary"].append(word["id"])
                linked.add(word["id"])

    metadata = {
        "bai": number, "title_zh": glossary["metadata"]["title_zh"], "title_vi": glossary["metadata"]["title_vi"],
        "source_glossary": f"data/glossary_bai{number:02d}.json",
        "source_text": f"data/_extracted/bai/bai{number:02d}.txt",
        "total_questions": len(questions),
        "level_distribution": dict(Counter(question["level"] for question in questions)),
        "type_distribution": dict(Counter(question["type"] for question in questions)),
        "group_distribution": {"mcq": sum(question["type"] in MCQ_TYPES for question in questions), "typing": sum(question["type"] in TYPED_TYPES for question in questions)},
        "generated_at": generated_at, "version": "2.0",
    }
    return {"metadata": metadata, "questions": questions}, glossary, source_lines


def validate(payload: dict, glossary: dict, source_lines: list[str]) -> None:
    number = payload["metadata"]["bai"]
    questions = payload["questions"]
    expected_ids = [f"quiz_bai{number:02d}_{index:03d}" for index in range(1, 31)]
    assert [question["id"] for question in questions] == expected_ids
    assert len({question["id"] for question in questions}) == 30
    assert payload["metadata"]["total_questions"] == 30
    assert payload["metadata"]["type_distribution"] == TYPE_DISTRIBUTION
    assert payload["metadata"]["level_distribution"] == LEVEL_DISTRIBUTION
    assert payload["metadata"]["group_distribution"] == {"mcq": 21, "typing": 9}

    glossary_ids = {entry["id"] for entry in glossary["entries"]}
    required_coverage = {entry["id"] for entry in glossary["entries"]}
    covered = set()
    exercise_line = next((index + 1 for index, line in enumerate(source_lines) if "练习" in line), len(source_lines) + 1)
    for question in questions:
        assert 1 <= question["source"]["source_line"] < exercise_line, (question["id"], question["source"])
        assert 1 <= question["difficulty_score"] <= 5
        assert question["confidence"] in {"high", "medium", "low"}
        assert not HANGUL.search(json.dumps(question, ensure_ascii=False)), question["id"]
        assert question["related_glossary"] and len(question["related_glossary"]) == len(set(question["related_glossary"])), question["id"]
        assert all(item in glossary_ids for item in question["related_glossary"]), question["id"]
        covered.update(question["related_glossary"])
        explanation = question["explanation"]
        assert explanation["why_correct"] and explanation["keyword_tip"] and explanation["concept"]
        if question["type"] in MCQ_TYPES:
            assert len(question["options"]) == 4
            assert len({option["text"] for option in question["options"]}) == 4
            option_ids = {option["id"] for option in question["options"]}
            assert option_ids == set(OPTION_IDS)
            assert question["correct_option"] in option_ids
            assert set(explanation["why_others_wrong"]) == option_ids - {question["correct_option"]}
        else:
            assert question["sample_answer"]
            assert question["keywords_required"]
            assert 2 <= len(question["hints"]) <= 3
            assert explanation["common_mistakes"]
            if question["type"] != "typing_zh_from_pinyin":
                assert 1 <= len(question["alternative_answers"]) <= 3
                assert all(normalize(alt) != normalize(question["sample_answer"]) for alt in question["alternative_answers"])
            if question["type"] in {"translation_vi_to_zh", "sentence_reorder"}:
                assert 5 <= han_length(question["sample_answer"]) <= 15, (question["id"], question["sample_answer"])
                assert 2 <= len(question["keywords_required"]) <= 4
            if question["type"] in {"translation_vi_to_zh", "translation_zh_to_vi"}:
                assert len(question["question_vi"].split()) <= 20
        if question["confidence"] == "low":
            assert question["note"]

    assert required_coverage <= covered, sorted(required_coverage - covered)
    grammar_counts = Counter(
        item for question in questions for item in question["related_glossary"] if re.search(r"_g\d+$", item)
    )
    for grammar in (entry for entry in glossary["entries"] if entry["type"] == "grammar"):
        assert 2 <= grammar_counts[grammar["id"]] <= 3, (grammar["id"], grammar_counts[grammar["id"]])


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    summaries = []
    for number in range(2, 11):
        payload, glossary, source_lines = build_lesson(number, generated_at)
        validate(payload, glossary, source_lines)
        output = TEMP_DIR / f"quiz_bai{number:02d}.json"
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        reparsed = json.loads(output.read_text(encoding="utf-8"))
        validate(reparsed, glossary, source_lines)
        summaries.append(reparsed["metadata"])
    print(json.dumps(summaries, ensure_ascii=False))


if __name__ == "__main__":
    main()
