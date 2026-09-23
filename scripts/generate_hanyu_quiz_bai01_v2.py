from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GLOSSARY_PATH = ROOT / "data" / "glossary_bai01.json"
SOURCE_PATH = ROOT / "data" / "_extracted" / "bai" / "bai01.txt"
OUTPUT_PATH = ROOT / "data" / "quiz_bai01.json"


questions: list[dict] = []


def source(line: int, context: str) -> dict:
    return {"bai": 1, "source_line": line, "context": context}


def add_mcq(
    qtype: str,
    level: str,
    question_vi: str,
    options: list[str],
    correct: str,
    why_correct: str,
    why_others_wrong: dict[str, str],
    keyword_tip: str,
    concept: str,
    related: list[str],
    line: int,
    context: str,
    difficulty: int,
    **extra: object,
) -> None:
    number = len(questions) + 1
    option_ids = ["A", "B", "C", "D"]
    entry = {
        "id": f"quiz_bai01_{number:03d}",
        "bai": 1,
        "level": level,
        "type": qtype,
        "question_vi": question_vi,
        **extra,
        "options": [{"id": option_id, "text": text} for option_id, text in zip(option_ids, options)],
        "correct_option": correct,
        "explanation": {
            "why_correct": why_correct,
            "why_others_wrong": why_others_wrong,
            "keyword_tip": keyword_tip,
            "concept": concept,
        },
        "related_glossary": related,
        "source": source(line, context),
        "difficulty_score": difficulty,
        "confidence": "high",
        "note": None,
    }
    questions.append(entry)


def add_typed(entry: dict) -> None:
    number = len(questions) + 1
    questions.append({
        "id": f"quiz_bai01_{number:03d}",
        "bai": 1,
        **entry,
        "confidence": "high",
        "note": None,
    })


add_mcq(
    "mcq_meaning_zh_to_vi", "recall", "“变化” có nghĩa là gì?",
    ["thay đổi; sự thay đổi", "tăng thêm", "kiến trúc", "quá khứ"], "A",
    "变化 vừa có thể là động từ “thay đổi”, vừa có thể là danh từ “sự thay đổi”.",
    {"B": "增加 nhấn mạnh tăng thêm.", "C": "建筑 là xây dựng hoặc kiến trúc.", "D": "过去 là quá khứ hoặc trước đây."},
    "Liên hệ câu 这几年变化很大。", "Nghĩa và từ loại của 变化",
    ["bai01_w001", "bai01_w008", "bai01_w009", "bai01_w010"], 80, "Mục 生词", 1,
)
add_mcq(
    "mcq_meaning_zh_to_vi", "recall", "“暖气” có nghĩa là gì?",
    ["thời tiết", "hệ thống sưởi", "dự báo", "nhiệt độ không khí"], "B",
    "暖气 là hệ thống hoặc thiết bị sưởi trong nhà.",
    {"A": "天气 là thời tiết.", "C": "预报 là dự báo.", "D": "气温 là nhiệt độ không khí."},
    "暖 là ấm; 暖气 cung cấp hơi ấm trong nhà.", "Từ vựng thời tiết và nhà ở",
    ["bai01_w017", "bai01_w018", "bai01_w019", "bai01_w020"], 125, "Mục 生词", 1,
)
add_mcq(
    "mcq_meaning_zh_to_vi", "recall", "“旅馆” có nghĩa là gì?",
    ["gia đình", "căn phòng", "nhà nghỉ; khách sạn", "nhà hàng"], "C",
    "旅馆 là nơi cung cấp phòng nghỉ cho khách.",
    {"A": "家庭 là gia đình.", "B": "屋子 là căn phòng.", "D": "饭店 có thể là nhà hàng hoặc khách sạn."},
    "旅 là đi xa, 馆 là cơ sở phục vụ công cộng.", "Từ vựng nơi ở và dịch vụ",
    ["bai01_w023", "bai01_w025", "bai01_w026", "bai01_w027"], 290, "Mục 生词", 1,
)
add_mcq(
    "mcq_meaning_zh_to_vi", "recall", "“名曲” có nghĩa là gì?",
    ["dân ca", "bài hát", "bản nhạc nổi tiếng", "thế giới"], "C",
    "名曲 là một ca khúc hoặc nhạc phẩm nổi tiếng.",
    {"A": "民歌 là dân ca.", "B": "歌曲 là bài hát nói chung.", "D": "世界 là thế giới."},
    "名 nghĩa là nổi tiếng; 曲 là khúc nhạc.", "Từ vựng âm nhạc",
    ["bai01_w033", "bai01_w034", "bai01_w035", "bai01_w036", "bai01_w037"], 298, "Mục 生词", 1,
)
add_mcq(
    "mcq_meaning_zh_to_vi", "recall", "“遥远” có nghĩa là gì?",
    ["cổ điển", "hiện đại", "trẻ", "xa xôi; xa thẳm"], "D",
    "遥远 diễn tả khoảng cách rất xa.",
    {"A": "古典 là cổ điển.", "B": "现代 là hiện đại.", "C": "年轻 là trẻ."},
    "Ghi nhớ câu hát 在那遥远的地方。", "Tính từ miêu tả khoảng cách",
    ["bai01_w031", "bai01_w032", "bai01_w038", "bai01_w040", "bai01_w041"], 72, "Bài khóa về âm nhạc", 1,
)

add_mcq(
    "mcq_meaning_vi_to_zh", "recall", "Từ nào có nghĩa là “dân số”?",
    ["城市", "人口", "建筑", "天气"], "B",
    "人口 là dân số, tức số người trong một khu vực.",
    {"A": "城市 là thành phố.", "C": "建筑 là kiến trúc hoặc xây dựng.", "D": "天气 là thời tiết."},
    "人 là người, 口 được dùng khi đếm nhân khẩu.", "Từ vựng đô thị",
    ["bai01_w005", "bai01_w007", "bai01_w009", "bai01_w018"], 107, "Mục 生词", 1,
)
add_mcq(
    "mcq_meaning_vi_to_zh", "recall", "Từ nào có nghĩa là “lời bài hát”?",
    ["歌曲", "民歌", "歌词", "迷"], "C",
    "歌词 là phần lời được hát trong một bài hát.",
    {"A": "歌曲 là bài hát.", "B": "民歌 là dân ca.", "D": "迷 là người mê một lĩnh vực."},
    "歌 là hát, 词 là lời hoặc từ ngữ.", "Từ vựng âm nhạc",
    ["bai01_w028", "bai01_w035", "bai01_w037", "bai01_w039"], 304, "Mục 生词", 1,
)

add_mcq(
    "mcq_pinyin", "recall", "Pinyin đúng của “暑假” là gì?",
    ["shǔjià", "shūjiǎ", "shùjiā", "shǔjiā"], "A",
    "暑假 đọc là shǔjià, nghĩa là kỳ nghỉ hè.",
    {"B": "Sai thanh ở cả hai âm tiết.", "C": "暑 không đọc thanh 4 và 假 không đọc jiā trong nghĩa kỳ nghỉ.", "D": "假 trong kỳ nghỉ đọc jià."},
    "暑 thanh 3, 假 thanh 4.", "Pinyin có dấu thanh",
    ["bai01_w002", "bai01_w003"], 102, "Mục 生词; OCR đã phục hồi 暑假", 2,
)
add_mcq(
    "mcq_pinyin", "recall", "Pinyin đúng của “也许” là gì?",
    ["yěxǔ", "yéxù", "yěxù", "yèxǔ"], "A",
    "也许 đọc là yěxǔ và có nghĩa là có lẽ.",
    {"B": "Cả hai thanh đều sai.", "C": "许 phải mang thanh 3.", "D": "也 phải mang thanh 3."},
    "Cả 也 và 许 đều có thanh 3 trong dạng từ điển.", "Pinyin của phó từ",
    ["bai01_w029", "bai01_w030"], 294, "Mục 生词", 2,
)

add_mcq(
    "mcq_word_type", "understand", "Trong câu “上海比北京大”, từ “比” thuộc từ loại nào?",
    ["名 (danh từ)", "动 (động từ)", "介 (giới từ)", "副 (phó từ)"], "C",
    "比 đứng trước đối tượng so sánh 北京 nên là giới từ.",
    {"A": "比 không gọi tên sự vật.", "B": "Trong cấu trúc này 比 không làm vị ngữ.", "D": "比 không bổ nghĩa trực tiếp cho tính từ như phó từ."},
    "Nhận diện mẫu A + 比 + B + tính từ.", "Từ loại của 比",
    ["bai01_w004"], 460, "Ngữ pháp câu 比", 2,
)
add_mcq(
    "mcq_word_type", "understand", "Trong “人口最多的城市”, từ “最” thuộc từ loại nào?",
    ["副 (phó từ)", "形 (tính từ)", "量 (lượng từ)", "连 (liên từ)"], "A",
    "最 là phó từ chỉ mức độ cao nhất và bổ nghĩa cho 多.",
    {"B": "最 không tự miêu tả tính chất.", "C": "最 không dùng để đếm.", "D": "最 không nối hai vế câu."},
    "So sánh 最 với 更 và 光: cả ba có thể làm phó từ.", "Phó từ chỉ mức độ",
    ["bai01_w006", "bai01_w012", "bai01_w029"], 108, "Mục 生词", 2,
)

add_mcq(
    "mcq_fill_blank", "apply", "Chọn từ đúng: 上海的冬天是不是___北京暖和一点儿？",
    ["最", "比", "更", "还"], "B",
    "比 đặt trước 北京 để tạo quan hệ so sánh với Thượng Hải.",
    {"A": "最 cần một phạm vi so sánh và không đứng trước 北京.", "C": "更 bổ nghĩa cho tính từ, không dẫn đối tượng so sánh.", "D": "还 là phó từ, không thay được giới từ 比."},
    "Cấu trúc: A + 是不是 + 比 + B + 形容词 + 一点儿.", "So sánh chênh lệch nhỏ",
    ["bai01_w003", "bai01_w004", "bai01_w006", "bai01_w012", "bai01_w014", "bai01_w015", "bai01_g002"], 33, "Bài khóa về mùa đông", 3,
    sentence_zh="上海的冬天是不是___北京暖和一点儿？",
)
add_mcq(
    "mcq_fill_blank", "apply", "Chọn từ đúng: 上海比过去变得___漂亮了。",
    ["更", "最", "光", "可是"], "A",
    "更 đứng trước 漂亮 để chỉ mức độ đẹp hơn trước.",
    {"B": "最 biểu thị mức cao nhất, không phù hợp với so sánh hai thời điểm này.", "C": "光 nghĩa là chỉ hoặc riêng.", "D": "可是 là liên từ nhưng."},
    "更 + tính từ = càng hoặc hơn nữa.", "Biểu đạt sự thay đổi về mức độ",
    ["bai01_w010", "bai01_w011", "bai01_w012", "bai01_w013", "bai01_w016"], 28, "Bài khóa về sự thay đổi của Thượng Hải", 2,
    sentence_zh="上海比过去变得___漂亮了。",
)
add_mcq(
    "mcq_fill_blank", "apply", "Chọn từ đúng: 天气预报说上海的___比北京高好几度。",
    ["天气", "气温", "暖气", "屋子"], "B",
    "气温 là đại lượng có thể cao hơn vài độ.",
    {"A": "天气 là khái niệm chung, không trực tiếp đi với 高好几度.", "C": "暖气 là hệ thống sưởi.", "D": "屋子 là căn phòng."},
    "Đơn vị 度 thường đo 气温.", "Bổ ngữ số lượng trong so sánh",
    ["bai01_w017", "bai01_w018", "bai01_w019", "bai01_w020", "bai01_w021", "bai01_w022", "bai01_w023", "bai01_g005"], 42, "Bài khóa và câu có 好几度", 3,
    sentence_zh="天气预报说上海的___比北京高好几度。",
)
add_mcq(
    "mcq_fill_blank", "apply", "Chọn từ đúng: 我是个音乐___，光CD就有好几百张呢。",
    ["歌曲", "歌词", "民歌", "迷"], "D",
    "音乐迷 là người mê âm nhạc.",
    {"A": "音乐歌曲 không chỉ người.", "B": "歌词 là lời bài hát.", "C": "民歌 là dân ca."},
    "Danh từ lĩnh vực + 迷 = người say mê lĩnh vực đó.", "Cách tạo danh từ chỉ người hâm mộ",
    ["bai01_w028", "bai01_w029", "bai01_w035", "bai01_w037", "bai01_w039"], 56, "Bài khóa về sở thích âm nhạc", 2,
    sentence_zh="我是个音乐___，光CD就有好几百张呢。",
)

add_mcq(
    "mcq_grammar", "understand", "Câu so sánh nào đúng ngữ pháp?",
    ["飞机比汽车很快。", "飞机汽车比快。", "飞机比汽车快。", "飞机很比汽车快。"], "C",
    "飞机比汽车快 đúng trật tự A + 比 + B + tính từ và không dùng 很.",
    {"A": "Không dùng 很 ngay trước tính từ trong câu 比.", "B": "比 phải đứng trước đối tượng B.", "D": "很比 không phải một cụm hợp lệ."},
    "Trong câu 比, tránh 很、真、非常 trước tính từ.", "Câu so sánh dùng 比",
    ["bai01_g001", "bai01_w004", "bai01_w021"], 465, "Ví dụ ngữ pháp 比", 3,
)
add_mcq(
    "mcq_grammar", "understand", "Cấu trúc nào diễn đạt “A không bằng B đến mức đó”?",
    ["A + 比 + B + 很 + 形容词", "A + 没有 + B + 那么 + 形容词", "A + 最 + B + 形容词", "A + 更 + B + 形容词"], "B",
    "A + 没有 + B + 那么 + tính từ biểu thị A không đạt mức của B.",
    {"A": "很 không đứng như vậy trong câu 比.", "C": "最 không dùng để nối A và B.", "D": "更 không dẫn đối tượng so sánh."},
    "Dạng phủ định thường dùng 没有; 那么 chỉ mức độ của B.", "So sánh không bằng",
    ["bai01_g004", "bai01_w015", "bai01_w024"], 546, "Ngữ pháp 有/没有...这么/那么", 3,
)

add_mcq(
    "mcq_error_detection", "apply", "Câu nào mắc lỗi dùng phó từ mức độ trong câu 比?",
    ["上海比北京很暖和。", "上海比北京暖和。", "上海比北京暖和一点儿。", "上海比北京暖和得多。"], "A",
    "上海比北京很暖和 sai vì 很 không đặt trước tính từ trong câu 比.",
    {"B": "Đây là câu 比 cơ bản đúng.", "C": "一点儿 đứng sau tính từ để chỉ chênh lệch nhỏ.", "D": "得多 đứng sau tính từ để chỉ chênh lệch lớn."},
    "Hãy tìm 很 ngay sau đối tượng B.", "Lỗi thường gặp trong câu 比",
    ["bai01_g001", "bai01_w004", "bai01_w014", "bai01_w015"], 488, "Ngữ pháp nêu câu sai với 很", 4,
)
add_mcq(
    "mcq_error_detection", "apply", "Câu nào phủ định phép so sánh sai trong ngữ cảnh trung tính?",
    ["弟弟没有我高。", "火车没有飞机快。", "弟弟比我不高。", "上海没有北京大。"], "C",
    "弟弟比我不高 sai trong lời kể trung tính; nên nói 弟弟没有我高.",
    {"A": "Dùng 没有 để nói em trai không cao bằng tôi là đúng.", "B": "Đây là mẫu phủ định so sánh đúng.", "D": "Câu này dùng 没有 đúng để phủ định so sánh."},
    "Phủ định trung tính: A + 没有 + B + tính từ.", "Phủ định câu so sánh",
    ["bai01_g003", "bai01_w004", "bai01_w021"], 528, "Ngữ pháp phủ định câu 比", 4,
)

add_mcq(
    "reading_comprehension", "understand", "Theo đoạn văn, nhận định nào đúng về Thượng Hải?",
    ["Thượng Hải đông dân hơn Bắc Kinh.", "Thượng Hải lớn hơn Bắc Kinh.", "Mọi gia đình ở Thượng Hải đều có sưởi.", "Nhiệt độ Thượng Hải thấp hơn Bắc Kinh."], "A",
    "Đoạn văn nói rõ 人口比北京多: dân số Thượng Hải nhiều hơn Bắc Kinh.",
    {"B": "Đoạn văn nói 上海没有北京大.", "C": "Gia đình thông thường không có sưởi.", "D": "气温比北京高好几度, không phải thấp hơn."},
    "Đối chiếu 大, 人口多 và 气温高.", "Đọc hiểu thông tin so sánh",
    ["bai01_w005", "bai01_w007", "bai01_w016", "bai01_w018", "bai01_w020", "bai01_w024", "bai01_g003"], 24, "Bài khóa về Thượng Hải và Bắc Kinh", 3,
    passage_zh="上海没有北京大，不过人口比北京多。上海的气温比北京高好几度，不过屋子里没有暖气。",
    passage_pinyin="Shànghǎi méiyǒu Běijīng dà, búguò rénkǒu bǐ Běijīng duō. Shànghǎi de qìwēn bǐ Běijīng gāo hǎo jǐ dù, búguò wūzi lǐ méiyǒu nuǎnqì.",
)
add_mcq(
    "reading_comprehension", "understand", "Vì sao thầy Vương nói “怎么说呢” khi được hỏi về nhạc thịnh hành?",
    ["Vì ông không hiểu câu hỏi.", "Vì ông khó diễn đạt và không thích bằng người trẻ.", "Vì ông chỉ nghe nhạc hiện đại.", "Vì ông không biết dân ca."], "B",
    "怎么说呢 cho thấy ông cân nhắc cách nói; sau đó ông nói mình có lẽ không thích bằng người trẻ.",
    {"A": "Ông hiểu câu hỏi và trả lời ngay sau đó.", "C": "Ông thích nhạc cổ điển và dân ca.", "D": "Ông nói rõ mình thích nghe dân ca."},
    "Đọc câu sau 怎么说呢 để suy ra thái độ người nói.", "Đọc hiểu hàm ý và câu cảm thán",
    ["bai01_p001", "bai01_w030", "bai01_w031", "bai01_w032", "bai01_w033", "bai01_w034", "bai01_w035", "bai01_w036", "bai01_w038", "bai01_w039", "bai01_w040", "bai01_g006"], 54, "Bài khóa về sở thích âm nhạc", 3,
    passage_zh="你喜欢流行歌曲吗？怎么说呢？可能没有你们年轻人那么喜欢。我还是觉得民歌的歌词好。",
    passage_pinyin="Nǐ xǐhuan liúxíng gēqǔ ma? Zěnme shuō ne? Kěnéng méiyǒu nǐmen niánqīngrén nàme xǐhuan. Wǒ háishi juéde míngē de gēcí hǎo.",
)

add_typed({
    "level": "apply", "type": "translation_vi_to_zh",
    "question_vi": "Dịch câu sau sang tiếng Trung:",
    "source_sentence_vi": "Thượng Hải đã trở nên đẹp hơn trước.", "target_language": "zh",
    "sample_answer": "上海比过去变得更漂亮了。",
    "sample_answer_pinyin": "Shànghǎi bǐ guòqù biàn de gèng piàoliang le.",
    "alternative_answers": ["跟过去比，上海变得更漂亮了。"],
    "keywords_required": [
        {"zh": "上海", "pinyin": "Shànghǎi", "meaning": "Thượng Hải"},
        {"zh": "过去", "pinyin": "guòqù", "meaning": "trước đây"},
        {"zh": "变", "pinyin": "biàn", "meaning": "trở nên; thay đổi"},
        {"zh": "漂亮", "pinyin": "piàoliang", "meaning": "đẹp"},
    ],
    "keywords_optional": [
        {"zh": "比", "pinyin": "bǐ", "meaning": "so với"},
        {"zh": "更", "pinyin": "gèng", "meaning": "hơn nữa"},
    ],
    "hints": ["Dùng 比 để so sánh với 过去.", "变得 + tính từ diễn tả sự thay đổi.", "更 đặt trước 漂亮."],
    "explanation": {
        "why_correct": "Câu dùng 比 để so sánh hiện tại với trước đây và 变得更漂亮 để nêu sự thay đổi.",
        "common_mistakes": ["Đặt 更 sau 漂亮.", "Bỏ 得 trong cấu trúc 变得 + tính từ."],
        "keyword_tip": "Ghép theo thứ tự 上海 → 比过去 → 变得 → 更漂亮.",
        "concept": "Câu 比 kết hợp 变得",
    },
    "related_glossary": ["bai01_w008", "bai01_w010", "bai01_w011", "bai01_w012", "bai01_w013", "bai01_g001"],
    "source": source(28, "Bài khóa về sự thay đổi của Thượng Hải"), "difficulty_score": 4,
})
add_typed({
    "level": "apply", "type": "translation_vi_to_zh",
    "question_vi": "Dịch câu sau sang tiếng Trung:",
    "source_sentence_vi": "Nhiệt độ ở Thượng Hải cao hơn Bắc Kinh mấy độ.", "target_language": "zh",
    "sample_answer": "上海的气温比北京高好几度。",
    "sample_answer_pinyin": "Shànghǎi de qìwēn bǐ Běijīng gāo hǎo jǐ dù.",
    "alternative_answers": ["上海气温比北京高好几度。"],
    "keywords_required": [
        {"zh": "气温", "pinyin": "qìwēn", "meaning": "nhiệt độ không khí"},
        {"zh": "比", "pinyin": "bǐ", "meaning": "so với"},
        {"zh": "高", "pinyin": "gāo", "meaning": "cao"},
        {"zh": "度", "pinyin": "dù", "meaning": "độ"},
    ],
    "keywords_optional": [{"zh": "好几", "pinyin": "hǎo jǐ", "meaning": "mấy; vài"}],
    "hints": ["Dùng mẫu A + 比 + B + tính từ.", "Cụm số lượng đặt sau 高.", "好几度 nghĩa là mấy độ."],
    "explanation": {
        "why_correct": "高好几度 đặt tính từ trước bổ ngữ số lượng, đúng trật tự của câu so sánh.",
        "common_mistakes": ["Đặt 好几度 trước 高.", "Bỏ 比 nên mất quan hệ so sánh."],
        "keyword_tip": "Khung câu: 上海的气温 + 比北京 + 高好几度.",
        "concept": "Bổ ngữ số lượng trong câu 比",
    },
    "related_glossary": ["bai01_w004", "bai01_w020", "bai01_w021", "bai01_w022", "bai01_g005"],
    "source": source(43, "Bài khóa về chênh lệch nhiệt độ"), "difficulty_score": 4,
})
add_typed({
    "level": "synthesize", "type": "translation_vi_to_zh",
    "question_vi": "Dịch câu sau sang tiếng Trung:",
    "source_sentence_vi": "Mùa đông chỗ chúng tôi không lạnh bằng ở đây.", "target_language": "zh",
    "sample_answer": "我们那儿冬天没有这儿这么冷。",
    "sample_answer_pinyin": "Wǒmen nàr dōngtiān méiyǒu zhèr zhème lěng.",
    "alternative_answers": ["我们那儿冬天没有这儿那么冷。"],
    "keywords_required": [
        {"zh": "我们那儿", "pinyin": "wǒmen nàr", "meaning": "chỗ chúng tôi"},
        {"zh": "冬天", "pinyin": "dōngtiān", "meaning": "mùa đông"},
        {"zh": "没有", "pinyin": "méiyǒu", "meaning": "không bằng"},
        {"zh": "冷", "pinyin": "lěng", "meaning": "lạnh"},
    ],
    "keywords_optional": [{"zh": "这么", "pinyin": "zhème", "meaning": "đến mức này"}],
    "hints": ["Dùng 没有 để nói không bằng.", "这么 đứng trước tính từ.", "冬天 đặt sau nơi chốn hoặc chủ đề."],
    "explanation": {
        "why_correct": "Mẫu A + 没有 + B + 这么 + tính từ diễn tả A không đạt mức độ của B.",
        "common_mistakes": ["Dùng 不比 trong câu kể trung tính.", "Đặt 这么 sau 冷."],
        "keyword_tip": "Nhớ cụm 没有这儿这么冷.",
        "concept": "So sánh không bằng với 没有",
    },
    "related_glossary": ["bai01_w014", "bai01_w015", "bai01_g004"],
    "source": source(570, "Ví dụ ngữ pháp so sánh không bằng"), "difficulty_score": 4,
})
add_typed({
    "level": "synthesize", "type": "translation_vi_to_zh",
    "question_vi": "Dịch câu sau sang tiếng Trung:",
    "source_sentence_vi": "Lời bài hát dân ca viết hay biết bao!", "target_language": "zh",
    "sample_answer": "民歌的歌词写得多好啊！",
    "sample_answer_pinyin": "Míngē de gēcí xiě de duō hǎo a!",
    "alternative_answers": ["民歌的歌词写得真好啊！", "民歌的歌词写得太好了！"],
    "keywords_required": [
        {"zh": "民歌", "pinyin": "míngē", "meaning": "dân ca"},
        {"zh": "歌词", "pinyin": "gēcí", "meaning": "lời bài hát"},
        {"zh": "写得", "pinyin": "xiě de", "meaning": "viết được; viết một cách"},
        {"zh": "好", "pinyin": "hǎo", "meaning": "hay; tốt"},
    ],
    "keywords_optional": [{"zh": "多", "pinyin": "duō", "meaning": "biết bao"}, {"zh": "啊", "pinyin": "a", "meaning": "trợ từ cảm thán"}],
    "hints": ["Dùng 写得 để nhận xét cách viết.", "Mẫu 多 + tính từ diễn tả cảm thán.", "Có thể thêm 啊 cuối câu."],
    "explanation": {
        "why_correct": "多好啊 tạo câu cảm thán; 写得好 nhận xét lời dân ca được viết hay.",
        "common_mistakes": ["Nhầm 多好 với 很好 trong sắc thái cảm thán.", "Bỏ 得 sau 写."],
        "keyword_tip": "民歌的歌词 → 写得 → 多好啊.",
        "concept": "Câu cảm thán 多 + tính từ",
    },
    "related_glossary": ["bai01_w035", "bai01_w039", "bai01_g006"],
    "source": source(634, "Ví dụ ngữ pháp câu cảm thán"), "difficulty_score": 5,
})

add_typed({
    "level": "understand", "type": "translation_zh_to_vi",
    "question_vi": "Dịch câu sau sang tiếng Việt:",
    "source_sentence_zh": "今年暑假我还在那儿玩了一个多月呢。",
    "source_sentence_pinyin": "Jīnnián shǔjià wǒ hái zài nàr wán le yí ge duō yuè ne.",
    "target_language": "vi", "sample_answer": "Kỳ nghỉ hè năm nay tôi còn chơi ở đó hơn một tháng.",
    "alternative_answers": ["Hè năm nay tôi vẫn ở đó chơi hơn một tháng.", "Trong kỳ nghỉ hè năm nay, tôi còn ở đó chơi hơn một tháng."],
    "keywords_required": [{"vi": "kỳ nghỉ hè", "zh": "暑假"}, {"vi": "vẫn; còn", "zh": "还"}, {"vi": "ở đó", "zh": "那儿"}, {"vi": "hơn một tháng", "zh": "一个多月"}],
    "keywords_optional": [{"vi": "năm nay", "zh": "今年"}],
    "hints": ["还 mang nghĩa vẫn hoặc còn.", "一个多月 là hơn một tháng.", "呢 tạo sắc thái nhấn nhẹ."],
    "explanation": {
        "why_correct": "Bản dịch giữ đủ thời gian 暑假, phó từ 还 và khoảng thời gian 一个多月.",
        "common_mistakes": ["Dịch 还 thành trả lại.", "Hiểu 一个多月 là nhiều tháng."],
        "keyword_tip": "暑假 → 还 → 那儿 → 一个多月.",
        "concept": "Phó từ 还 và bổ ngữ thời lượng",
    },
    "related_glossary": ["bai01_w002", "bai01_w003"],
    "source": source(21, "Bài khóa về chuyến đi Thượng Hải"), "difficulty_score": 3,
})
add_typed({
    "level": "understand", "type": "translation_zh_to_vi",
    "question_vi": "Dịch câu sau sang tiếng Việt:",
    "source_sentence_zh": "一般的家庭没有，不过旅馆和饭店里有。",
    "source_sentence_pinyin": "Yìbān de jiātíng méiyǒu, búguò lǚguǎn hé fàndiàn lǐ yǒu.",
    "target_language": "vi", "sample_answer": "Gia đình bình thường thì không có, nhưng khách sạn và nhà hàng thì có.",
    "alternative_answers": ["Nhà dân thông thường không có, còn khách sạn và nhà hàng thì có.", "Các gia đình thường không có, nhưng trong khách sạn và nhà hàng thì có."],
    "keywords_required": [{"vi": "gia đình", "zh": "家庭"}, {"vi": "không có", "zh": "没有"}, {"vi": "khách sạn", "zh": "旅馆"}, {"vi": "nhà hàng", "zh": "饭店"}],
    "keywords_optional": [{"vi": "nhưng", "zh": "不过"}],
    "hints": ["不过 nối hai vế tương phản.", "旅馆 là nơi lưu trú.", "饭店 trong ngữ cảnh này là nhà hàng hoặc khách sạn."],
    "explanation": {
        "why_correct": "Câu đối chiếu nơi không có và nơi có 暖气; danh từ bị lược nhưng hiểu theo ngữ cảnh.",
        "common_mistakes": ["Dịch 不过 thành đi qua.", "Bỏ quan hệ tương phản giữa hai vế."],
        "keyword_tip": "家庭没有 ↔ 旅馆和饭店里有.",
        "concept": "Lược bỏ danh từ đã biết và liên từ tương phản",
    },
    "related_glossary": ["bai01_w016", "bai01_w017", "bai01_w025", "bai01_w026", "bai01_w027"],
    "source": source(48, "Bài khóa về hệ thống sưởi"), "difficulty_score": 3,
})

add_typed({
    "level": "recall", "type": "typing_zh_from_pinyin",
    "question_vi": "Gõ chữ Hán tương ứng với pinyin và nghĩa sau:",
    "pinyin": "nuǎnhuo", "meaning_vi": "ấm áp", "meaning_en": "warm",
    "sample_answer": "暖和", "alternative_answers": [],
    "keywords_required": [{"zh": "暖和", "pinyin": "nuǎnhuo", "meaning": "ấm áp"}],
    "keywords_optional": [],
    "hints": ["Chữ đầu có bộ 日 ở bên trái.", "Từ gồm hai chữ, chữ thứ hai là 和."],
    "explanation": {
        "why_correct": "暖和 đọc là nuǎnhuo và có nghĩa là ấm áp.",
        "common_mistakes": ["Viết nhầm 暖 thành 暧.", "Gõ nhầm 和 thành 合."],
        "keyword_tip": "暖 chỉ sự ấm; 和 là âm tiết nhẹ trong từ này.",
        "concept": "Từ vựng thời tiết",
    },
    "related_glossary": ["bai01_w015"],
    "source": source(122, "Mục 生词"), "difficulty_score": 2,
})
add_typed({
    "level": "recall", "type": "typing_zh_from_pinyin",
    "question_vi": "Gõ chữ Hán tương ứng với pinyin và nghĩa sau:",
    "pinyin": "yáoyuǎn", "meaning_vi": "xa xôi; xa thẳm", "meaning_en": "distant",
    "sample_answer": "遥远", "alternative_answers": [],
    "keywords_required": [{"zh": "遥远", "pinyin": "yáoyuǎn", "meaning": "xa xôi"}],
    "keywords_optional": [],
    "hints": ["Cả hai chữ đều liên quan đến khoảng cách.", "Chữ đầu là 遥, không phải 摇."],
    "explanation": {
        "why_correct": "遥远 đọc là yáoyuǎn và miêu tả nơi hoặc khoảng cách rất xa.",
        "common_mistakes": ["Viết 遥 thành 摇.", "OCR nguồn từng nhận nhầm 遥 thành 各."],
        "keyword_tip": "Nhớ cụm 在那遥远的地方.",
        "concept": "Tính từ chỉ khoảng cách",
    },
    "related_glossary": ["bai01_w041"],
    "source": source(72, "Bài khóa; chữ 遥 đã phục hồi từ OCR"), "difficulty_score": 3,
})

add_typed({
    "level": "apply", "type": "sentence_reorder",
    "question_vi": "Sắp xếp các phần sau thành câu đúng:",
    "shuffled_parts": ["暖和一点儿", "北京", "上海冬天", "比", "吗"],
    "sample_answer": "上海冬天比北京暖和一点儿吗？",
    "sample_answer_pinyin": "Shànghǎi dōngtiān bǐ Běijīng nuǎnhuo yìdiǎnr ma?",
    "alternative_answers": ["上海冬天是不是比北京暖和一点儿？"],
    "keywords_required": [
        {"zh": "上海冬天", "pinyin": "Shànghǎi dōngtiān", "meaning": "mùa đông ở Thượng Hải"},
        {"zh": "吗", "pinyin": "ma", "meaning": "không; trợ từ nghi vấn"},
        {"zh": "比北京", "pinyin": "bǐ Běijīng", "meaning": "so với Bắc Kinh"},
        {"zh": "暖和一点儿", "pinyin": "nuǎnhuo yìdiǎnr", "meaning": "ấm hơn một chút"},
    ],
    "keywords_optional": [],
    "hints": ["Đặt chủ đề 上海冬天 ở đầu.", "吗 đứng cuối câu hỏi.", "一点儿 đứng sau 暖和."],
    "explanation": {
        "why_correct": "Trật tự là chủ đề + 比 + đối tượng + tính từ + mức chênh lệch + 吗.",
        "common_mistakes": ["Đặt 吗 trước cụm 比.", "Đặt 一点儿 trước 暖和."],
        "keyword_tip": "上海冬天 → 比北京 → 暖和一点儿 → 吗.",
        "concept": "Trật tự câu hỏi so sánh 比",
    },
    "related_glossary": ["bai01_w004", "bai01_w014", "bai01_w015", "bai01_g002"],
    "source": source(33, "Câu hỏi trong bài khóa"), "difficulty_score": 4,
})


def validate(payload: dict, glossary: dict, source_lines: list[str]) -> None:
    expected_types = {
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
    entries = payload["questions"]
    ids = [entry["id"] for entry in entries]
    assert ids == [f"quiz_bai01_{index:03d}" for index in range(1, 31)]
    assert Counter(entry["type"] for entry in entries) == Counter(expected_types)
    assert payload["metadata"]["type_distribution"] == expected_types
    assert payload["metadata"]["total_questions"] == len(entries) == 30

    glossary_ids = {entry["id"] for entry in glossary["entries"]}
    covered_ids = set()
    hangul = re.compile(r"[\uac00-\ud7af]")
    han = re.compile(r"[\u4e00-\u9fff]")
    typed_types = {
        "translation_vi_to_zh", "translation_zh_to_vi",
        "typing_zh_from_pinyin", "sentence_reorder",
    }
    for entry in entries:
        assert 1 <= entry["source"]["source_line"] <= len(source_lines), entry["id"]
        assert 1 <= entry["difficulty_score"] <= 5, entry["id"]
        assert not hangul.search(json.dumps(entry, ensure_ascii=False)), entry["id"]
        assert entry["related_glossary"], entry["id"]
        assert all(item in glossary_ids for item in entry["related_glossary"]), entry["id"]
        covered_ids.update(entry["related_glossary"])
        explanation = entry["explanation"]
        assert explanation["why_correct"] and explanation["keyword_tip"] and explanation["concept"]
        if entry["type"] in typed_types:
            assert entry["sample_answer"], entry["id"]
            assert "keywords_required" in entry and entry["keywords_required"], entry["id"]
            assert 2 <= len(entry["hints"]) <= 3, entry["id"]
            assert explanation["common_mistakes"], entry["id"]
            alternatives = entry["alternative_answers"]
            if entry["type"] != "typing_zh_from_pinyin":
                assert 1 <= len(alternatives) <= 3, entry["id"]
                normalized = lambda value: re.sub(r"[\s，。？！、；：,.?!;:]", "", value.lower())
                assert all(normalized(item) != normalized(entry["sample_answer"]) for item in alternatives), entry["id"]
            if entry["type"] in {"translation_vi_to_zh", "sentence_reorder"}:
                length = len(han.findall(entry["sample_answer"]))
                assert 5 <= length <= 15, (entry["id"], length)
                assert len(entry["keywords_required"]) in {2, 3, 4}, entry["id"]
        else:
            assert len(entry["options"]) == 4, entry["id"]
            option_ids = {option["id"] for option in entry["options"]}
            assert option_ids == {"A", "B", "C", "D"}, entry["id"]
            assert entry["correct_option"] in option_ids, entry["id"]
            assert set(explanation["why_others_wrong"]) == option_ids - {entry["correct_option"]}, entry["id"]

    word_and_grammar_ids = {
        entry["id"] for entry in glossary["entries"] if entry["type"] in {"word", "grammar"}
    }
    assert word_and_grammar_ids <= covered_ids, sorted(word_and_grammar_ids - covered_ids)
    grammar_counts = Counter(
        related for entry in entries for related in entry["related_glossary"] if "_g" in related
    )
    assert all(2 <= grammar_counts[f"bai01_g{number:03d}"] <= 3 for number in range(1, 7)), grammar_counts


def main() -> None:
    glossary = json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))
    source_lines = SOURCE_PATH.read_text(encoding="utf-8", errors="replace").splitlines()
    type_distribution = dict(Counter(entry["type"] for entry in questions))
    level_distribution = dict(Counter(entry["level"] for entry in questions))
    payload = {
        "metadata": {
            "bai": 1,
            "title_zh": glossary["metadata"]["title_zh"],
            "title_vi": glossary["metadata"]["title_vi"],
            "source_glossary": "data/glossary_bai01.json",
            "source_text": "data/_extracted/bai/bai01.txt",
            "total_questions": len(questions),
            "level_distribution": level_distribution,
            "type_distribution": type_distribution,
            "group_distribution": {"mcq": 21, "typing": 9},
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "version": "2.0",
        },
        "questions": questions,
    }
    validate(payload, glossary, source_lines)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reparsed = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    validate(reparsed, glossary, source_lines)
    print(json.dumps(reparsed["metadata"], ensure_ascii=False))


if __name__ == "__main__":
    main()
