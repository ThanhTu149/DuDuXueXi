from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".codex_deps"))

from pypinyin import Style, lazy_pinyin  # noqa: E402


TYPE_TAGS = {
    "名": "danh_tu",
    "动": "dong_tu",
    "形": "hinh_dung",
    "助": "tro_tu",
    "代": "dai_tu",
    "副": "pho_tu",
    "介": "gioi_tu",
    "连": "lien_tu",
    "叹": "than_tu",
    "量": "luong_tu",
    "数": "so_tu",
}


def W(zh, word_type, vi, en, pinyin=None, confidence="high", note=None):
    return {
        "zh": zh,
        "word_type": word_type,
        "vi": vi,
        "en": en,
        "pinyin": pinyin,
        "confidence": confidence,
        "note": note,
    }


def G(title_zh, title_vi, structure, explanation_vi, explanation_zh, examples, page):
    return {
        "title_zh": title_zh,
        "title_vi": title_vi,
        "structure": structure,
        "explanation_vi": explanation_vi,
        "explanation_zh": explanation_zh,
        "examples": examples,
        "page": page,
    }


def P(zh, vi, en, usage, page, pinyin=None):
    return {
        "zh": zh,
        "vi": vi,
        "en": en,
        "usage": usage,
        "page": page,
        "pinyin": pinyin,
    }


LESSONS = {
    1: {
        "title_zh": "我比你更喜欢音乐",
        "title_vi": "Tôi thích âm nhạc hơn bạn",
        "default_page": 12,
        "words": [
            W("变化", "动、名", "thay đổi; sự thay đổi", "to change; change"),
            W("暑假", "名", "kỳ nghỉ hè", "summer vacation"),
            W("还", "副", "vẫn; còn; cũng", "still; yet; also", "hái"),
            W("比", "介", "so với; hơn", "than; compared with"),
            W("人口", "名", "dân số", "population"),
            W("最", "副", "nhất", "most; to the highest degree"),
            W("城市", "名", "thành phố", "city"),
            W("增加", "动", "tăng thêm", "to increase"),
            W("建筑", "动、名", "xây dựng; kiến trúc", "to construct; architecture"),
            W("过去", "名", "quá khứ", "past"),
            W("变", "动", "thay đổi; trở nên khác", "to change; to become different"),
            W("更", "副", "càng; hơn nữa", "more; even more"),
            W("漂亮", "形", "đẹp; xinh đẹp", "beautiful"),
            W("冬天", "名", "mùa đông", "winter"),
            W("暖和", "形", "ấm áp", "warm"),
            W("可是", "连", "nhưng", "but"),
            W("暖气", "名", "hệ thống sưởi", "heating system"),
            W("天气", "名", "thời tiết", "weather"),
            W("预报", "动、名", "dự báo; bản dự báo", "to forecast; forecast"),
            W("气温", "名", "nhiệt độ không khí", "air temperature"),
            W("高", "形", "cao", "tall; high"),
            W("度", "量", "độ", "degree"),
            W("屋子", "名", "căn phòng", "room"),
            W("感觉", "动、名", "cảm thấy; cảm giác", "to feel; sense"),
            W("家庭", "名", "gia đình", "family"),
            W("旅馆", "名", "nhà nghỉ; khách sạn", "hotel"),
            W("饭店", "名", "khách sạn; nhà hàng", "hotel; restaurant"),
            W("迷", "动", "mê; say mê", "to be crazy about; to indulge in"),
            W("光", "副", "chỉ", "only"),
            W("也许", "副", "có lẽ; có thể", "perhaps; maybe; probably"),
            W("古典", "形", "cổ điển", "classical"),
            W("现代", "名、形", "hiện đại; thời hiện đại", "modern times; modern"),
            W("世界", "名", "thế giới", "world"),
            W("名曲", "名", "bản nhạc nổi tiếng", "a famous song or melody"),
            W("民歌", "名", "dân ca", "folk song"),
            W("流行", "动、形", "lưu hành; thịnh hành", "popular"),
            W("歌曲", "名", "bài hát", "song"),
            W("年轻", "形", "trẻ", "young"),
            W("歌词", "名", "lời bài hát", "lyrics; verse"),
            W("有些", "代", "một vài; có một số", "some"),
            W("遥远", "形", "xa xôi; xa thẳm", "distant"),
        ],
        "grammar": [
            G("“比”字句", "Câu so sánh dùng 比", "A + 比 + B + 谓语", "Dùng để nêu sự khác biệt giữa hai người hoặc sự vật. Nếu vị ngữ là tính từ thì không đặt 很、真、非常 ngay trước tính từ.", "比较两个事物之间的差别时用“比”字句；形容词前不能用“很、真、非常”等副词。", [("飞机比汽车快。", "Máy bay nhanh hơn ô tô."), ("他比弟弟大两岁。", "Anh ấy lớn hơn em trai hai tuổi.")], 15),
            G("比较程度的表达", "Biểu đạt mức độ chênh lệch", "A + 比 + B + 形容词 + 一点儿/一些/多/得多/多了", "一点儿 và 一些 chỉ chênh lệch nhỏ; 多、得多 và 多了 chỉ chênh lệch lớn.", "“一点儿、一些”表示差别不大；“多、得多、多了”表示差别大。", [("这件比那件贵多了。", "Cái này đắt hơn cái kia nhiều."), ("她跑得比我快得多。", "Cô ấy chạy nhanh hơn tôi rất nhiều.")], 17),
            G("比较句的否定", "Phủ định trong câu so sánh", "A + 没有 + B + 形容词", "Thông thường dùng 没有 để phủ định quan hệ so sánh. 不比 chủ yếu dùng khi phản bác hoặc không đồng ý với lời người khác.", "“比”字句的否定常用“没有”；“不比”只用于否定或反驳对方的话。", [("火车没有飞机快。", "Tàu hỏa không nhanh bằng máy bay."), ("我不比他高。", "Tôi không cao hơn anh ấy.")], 17),
            G("A有/没有B这么/那么……", "So sánh bằng hoặc không bằng", "A + 有/没有 + B + 这么/那么 + 形容词", "有 biểu thị đạt tới một mức độ; dạng khẳng định thường gặp trong câu hỏi, còn dạng phủ định thường dùng trong câu trần thuật.", "“有”表示达到或估量；肯定式多用于疑问句，否定式多用于陈述句。", [("我没有你考得那么好。", "Tôi thi không tốt bằng bạn."), ("我们那儿冬天没有这儿这么冷。", "Mùa đông chỗ chúng tôi không lạnh bằng ở đây.")], 18),
            G("数量补语", "Bổ ngữ số lượng trong so sánh", "A + 比 + B + 形容词 + 数量词", "Dùng để nêu mức chênh lệch cụ thể về số lượng hoặc mức độ; cụm số lượng đặt sau tính từ.", "数量补语说明具体的数量或程度差别，放在形容词后边。", [("他比弟弟大两岁。", "Anh ấy lớn hơn em trai hai tuổi."), ("罗兰比我跑得快五分钟。", "Roland chạy nhanh hơn tôi năm phút.")], 19),
            G("感叹句", "Câu cảm thán", "太/真 + 形容词；好/多 + 形容词 + 啊", "Dùng để biểu lộ cảm xúc, không dùng như một miêu tả khách quan thông thường. Mẫu 好/多 thường thêm 啊 ở cuối câu.", "感叹句表示感叹；“好/多+形容词”句末常加“啊”。", [("这儿的风景真美！", "Phong cảnh ở đây thật đẹp!"), ("他写得多好啊！", "Anh ấy viết hay biết bao!")], 19),
        ],
        "phrases": [
            P("怎么说呢", "nói thế nào nhỉ; khó mà nói", "how should I put it", "Dùng khi người nói thấy khó diễn đạt hoặc chưa biết nên nói thế nào.", 14),
        ],
    },
    2: {
        "title_zh": "我们那儿的冬天跟北京一样冷",
        "title_vi": "Mùa đông chỗ chúng tôi lạnh như ở Bắc Kinh",
        "default_page": 33,
        "words": [
            W("国家", "名", "quốc gia", "country"), W("一样", "形", "như nhau; giống nhau", "same"),
            W("时差", "名", "chênh lệch múi giờ", "time difference"), W("夜", "名", "đêm", "night"),
            W("季节", "名", "mùa; thời kỳ", "season"), W("春天", "名", "mùa xuân", "spring"),
            W("夏天", "名", "mùa hè", "summer"), W("秋天", "名", "mùa thu", "autumn"),
            W("热", "形", "nóng", "hot"), W("冷", "形", "lạnh", "cold"),
            W("刮风", "动", "gió thổi", "for the wind to blow"), W("风", "名", "gió", "wind"),
            W("下雪", "动", "tuyết rơi", "to snow"), W("雪", "名", "tuyết", "snow"),
            W("下雨", "动", "mưa rơi", "to rain"), W("不但……而且……", "连", "không những... mà còn...", "not only... but also...", "bùdàn...érqiě..."),
            W("得", "动", "đạt được; nhận được", "to get", "dé"), W("分", "名", "điểm", "point; mark", "fēn"),
            W("听写", "动、名", "nghe viết; chính tả", "to dictate; dictation"), W("周末", "名", "cuối tuần", "weekend"),
            W("出去", "动", "đi ra", "to go out"), W("历史", "名", "lịch sử", "history"),
            W("产生", "动", "nảy sinh; xuất hiện", "to give rise to; to bring about"), W("画册", "名", "tập tranh", "album of paintings"),
            W("研究", "动、名", "nghiên cứu", "to study; to research; research"), W("只是", "副", "chỉ là; có điều là", "only"),
            W("老", "形", "già; cũ", "old"), W("改革", "动、名", "cải cách; sửa đổi", "to reform; reformation"),
            W("开放", "动", "mở cửa; mở rộng", "to open"), W("一切", "代", "tất cả; mọi thứ", "all; everything"),
        ],
        "grammar": [
            G("跟……一样/不一样", "So sánh giống hoặc khác", "A + 跟 + B + 一样/不一样 + 谓语", "Dùng 一样 khi kết quả so sánh giống nhau và 不一样 khi khác nhau. Cả cụm cũng có thể làm định ngữ.", "“A跟B一样”表示相同，“A跟B不一样”表示不同；该结构也可以作定语。", [("这件毛衣跟那件价钱一样。", "Chiếc áo len này có giá giống chiếc kia."), ("姐姐跟弟弟的爱好不一样。", "Sở thích của chị gái khác với em trai.")], 35),
            G("不但……而且……", "Không những... mà còn...", "不但 + 分句1，而且 + 分句2", "Nối hai vế có ý nghĩa tăng tiến. Nếu hai vế cùng chủ ngữ, 不但 đứng sau chủ ngữ; nếu khác chủ ngữ, 不但 đứng trước chủ ngữ của vế đầu.", "“不但……而且……”连接递进复句；主语相同时“不但”放在主语后，不同时放在主语前。", [("他不但会说英语，而且还会法语。", "Anh ấy không những biết tiếng Anh mà còn biết tiếng Pháp."), ("不但她会说汉语，而且她妹妹也会说汉语。", "Không chỉ cô ấy biết tiếng Trung, em gái cô ấy cũng biết.")], 37),
        ],
        "phrases": [P("好了", "được rồi; thôi được rồi", "all right; that's enough", "Dùng để khuyên dừng hoặc báo người nói muốn kết thúc chủ đề hay hành động hiện tại.", 34)],
    },
    3: {
        "title_zh": "冬天快要到了", "title_vi": "Mùa đông sắp đến rồi", "default_page": 49,
        "words": [
            W("爱", "动", "yêu; thích", "to love; to like"), W("滑冰", "动", "trượt băng", "to skate"),
            W("滑雪", "动", "trượt tuyết", "to ski"), W("家乡", "名", "quê hương", "homeland"),
            W("有名", "形", "nổi tiếng", "famous"), W("风景", "名", "phong cảnh", "scenic view; landscape"),
            W("区", "名", "khu vực; vùng", "area; region"), W("旅游", "动", "du lịch", "to have a tour"),
            W("尤其", "副", "đặc biệt là; nhất là", "especially"), W("凉快", "形", "mát mẻ", "nice and cool"),
            W("避暑", "动", "nghỉ mát; tránh nóng", "to spend a holiday at a summer resort"), W("人家", "名", "nhà người ta; gia đình", "household; family"),
            W("靠", "动", "dựa vào; trông vào", "to rely on"), W("经营", "动", "kinh doanh; quản lý", "to manage; to run"),
            W("发财", "动", "phát tài; làm giàu", "to get rich; to make a fortune"), W("树叶", "名", "lá cây", "leaf"),
            W("树", "名", "cây", "tree"), W("叶", "名", "lá", "leaf"), W("落", "动", "rơi; rụng", "to fall", "luò"),
            W("红叶", "名", "lá đỏ mùa thu", "red autumn leaves"), W("捡", "动", "nhặt; lượm", "to pick up"),
            W("着急", "形", "sốt ruột; lo lắng", "feeling anxious", "zháojí"), W("表", "名", "đồng hồ đeo tay", "watch", "biǎo"),
            W("坏", "形", "hỏng; xấu", "bad; to go wrong"), W("哎呀", "叹", "ôi; ái chà", "expressing surprise or amazement"),
            W("停", "动", "dừng; ngừng", "to stop"), W("该", "动", "nên; cần phải", "should; ought to; need"),
            W("电池", "名", "pin", "battery"), W("迟到", "动", "đến muộn", "to be late"),
            W("好事", "名", "việc tốt; chuyện vui", "happy event; good thing"), W("坏事", "名", "việc xấu", "bad thing"),
            W("了", "助", "rồi; trợ từ biểu thị thay đổi", "modal particle indicating change", "le"),
            W("母亲", "名", "mẹ", "mother"), W("父亲", "名", "bố; cha", "father"),
            W("地", "助", "trợ từ nối trạng ngữ với động từ", "structural particle marking an adverbial", "de"),
            W("结婚", "动", "kết hôn", "to marry"), W("离婚", "动", "ly hôn", "to divorce"),
            W("未婚夫", "名", "chồng chưa cưới", "fiancé"), W("未婚妻", "名", "vợ chưa cưới", "fiancée"),
            W("将来", "名", "tương lai", "future"), W("这样", "代", "như thế này", "like this; this way"),
            W("那样", "代", "như thế kia", "like that; that way"),
        ],
        "grammar": [
            G("句尾的“了”", "了 cuối câu biểu thị thay đổi", "句子 + 了", "Đặt ở cuối câu để biểu thị trạng thái mới hoặc sự thay đổi so với trước.", "语气助词“了”用在句尾表示变化或新情况。", [("树叶已经黄了。", "Lá cây đã vàng rồi."), ("这件衣服小了。", "Bộ quần áo này đã chật rồi.")], 52),
            G("不……了", "Không... nữa", "不 + 动词/形容词 + 了", "Biểu thị tình trạng đã thay đổi: hành động hoặc trạng thái trước đây nay không còn tiếp tục.", "“不……了”表示情况发生了变化。", [("我不回国了。", "Tôi không về nước nữa."), ("我今天不发烧了。", "Hôm nay tôi không sốt nữa.")], 52),
            G("将要发生的表达", "Biểu đạt việc sắp xảy ra", "要/就要/快要/快 + 动词 + 了", "Các mẫu này báo một hành động hoặc tình huống sắp xảy ra. Khi có trạng ngữ thời gian cụ thể, dùng 就要 thay vì 快要.", "“要……了、就要……了、快要……了、快……了”表示即将发生；有具体时间状语时不用“快要”。", [("再有两个月就要放寒假了。", "Còn hai tháng nữa là nghỉ đông."), ("快要下雪了。", "Sắp có tuyết rơi rồi.")], 53),
            G("状语和结构助词“地”", "Trạng ngữ và trợ từ 地", "形容词/短语 + 地 + 动词", "地 là dấu hiệu nối trạng ngữ với động từ, cho biết cách thức hoặc trạng thái thực hiện hành động.", "结构助词“地”是句中状语的标志。", [("她高兴地告诉我，姐姐下个月就要结婚了。", "Cô ấy vui vẻ nói với tôi rằng tháng sau chị gái sẽ kết hôn."), ("同学们都在努力地学习。", "Các bạn học sinh đều đang chăm chỉ học tập.")], 54),
            G("无主句", "Câu không có chủ ngữ", "动词 + 名词/其他成分", "Một số câu tiếng Trung không có chủ ngữ, thường dùng để nói hiện tượng tự nhiên hoặc lời chúc.", "汉语有些句子没有主语，可说明自然现象或表示祝愿。", [("下雪了。", "Tuyết rơi rồi."), ("祝你生日快乐！", "Chúc bạn sinh nhật vui vẻ!")], 54),
        ],
        "phrases": [P("着什么急", "có gì mà phải vội", "what's the hurry", "Dùng để trấn an người đang sốt ruột.", 48, "zháo shénme jí"), P("还早着呢", "vẫn còn sớm lắm", "it is still very early", "着呢 nhấn mạnh mức độ hoặc trạng thái vẫn đang như vậy.", 48, "hái zǎo zhe ne")],
    },
    4: {
        "title_zh": "快上来吧，要开车了", "title_vi": "Mau lên đây, xe sắp chạy rồi", "default_page": 66,
        "words": [
            W("送", "动", "tặng; đưa; tiễn", "to deliver; to carry; to give; to see somebody off"), W("开会", "动", "họp", "to have or attend a meeting"),
            W("教学", "名", "giảng dạy", "teaching"), W("研讨", "动", "nghiên cứu và thảo luận", "to study and discuss"),
            W("研讨会", "名", "hội thảo", "seminar; symposium"), W("经过", "动", "đi qua; trải qua", "to pass; to go through"),
            W("向", "介", "hướng về; đối với", "to; towards; in the direction of"), W("问好", "动", "hỏi thăm; gửi lời chào", "to send regards; to say hello"),
            W("捎", "动", "mang hộ; cầm hộ", "to take something along for someone"), W("过去", "动", "đi sang; đi qua", "to go over; to pass by", "guòqu"),
            W("过来", "动", "đi đến; sang đây", "to come over; to come by"), W("门口", "名", "cửa ra vào; cổng", "entrance; doorway"),
            W("辛苦", "形", "vất vả; cực nhọc", "hard; strenuous"), W("麻烦", "动、形", "làm phiền; phiền phức", "to bother; trouble"),
            W("趟", "量", "lượt; chuyến", "classifier for trips"), W("爱人", "名", "vợ hoặc chồng; người yêu", "husband or wife; lover"),
            W("办事", "动", "làm việc; giải quyết công việc", "to handle affairs"), W("马上", "副", "lập tức; ngay", "at once; immediately"),
            W("慢", "形", "chậm", "slow"), W("展览馆", "名", "nhà triển lãm", "exhibition hall"),
            W("展览", "动、名", "trưng bày; triển lãm", "to exhibit; exhibition"), W("上来", "动", "đi lên phía người nói", "to come up"),
            W("开车", "动", "lái xe", "to drive"), W("照相机", "名", "máy ảnh", "camera"), W("照相", "动", "chụp ảnh", "to take a photograph"),
            W("座位", "名", "chỗ ngồi", "seat"), W("注意", "动", "chú ý", "to pay attention"),
            W("差不多", "形、副", "gần như; xấp xỉ", "almost; about the same"), W("文物", "名", "văn vật; di tích văn hóa", "cultural relic"),
            W("大约", "副", "khoảng; chừng", "approximately; about"), W("要求", "动、名", "yêu cầu", "to require; requirement"),
            W("省", "动", "tiết kiệm", "to save"), W("清楚", "形", "rõ ràng", "clear"),
            W("师傅", "名", "bác; thợ lành nghề; tài xế", "master worker; a respectful form of address"), W("大使馆", "名", "đại sứ quán", "embassy"),
            W("大使", "名", "đại sứ", "ambassador"),
        ],
        "grammar": [G("简单趋向补语", "Bổ ngữ xu hướng đơn", "动词 + 来/去", "来 chỉ hướng về phía người nói hoặc sự vật đang được nhắc tới; 去 chỉ hướng rời xa phía đó. Tân ngữ chỉ nơi chốn đặt trước 来/去.", "“来、去”放在动词后表示动作趋向；处所宾语放在“来/去”之前。", [("上课了，快进来吧。", "Vào học rồi, mau vào đây."), ("我们进教室去吧。", "Chúng ta vào lớp đi.")], 70)],
        "phrases": [P("快上来吧", "mau lên đây", "come up quickly", "Dùng khi gọi người khác di chuyển lên phía người nói.", 64)],
    },
    5: {
        "title_zh": "我听过钢琴协奏曲《黄河》", "title_vi": "Tôi đã nghe bản hòa tấu piano Hoàng Hà", "default_page": 83,
        "words": [
            W("经历", "动、名", "trải qua; kinh nghiệm", "to experience; experience"), W("过", "助", "đã từng", "particle indicating a past experience", "guo"),
            W("住院", "动", "nằm viện", "to be hospitalized"), W("中医", "名", "đông y; bác sĩ đông y", "traditional Chinese medicine; doctor of Chinese medicine"),
            W("苦", "形", "đắng", "bitter"), W("中成药", "名", "thuốc đông y bào chế sẵn", "prepared Chinese medicine"),
            W("甜", "形", "ngọt", "sweet"), W("摸", "动", "sờ; bắt; vuốt", "to feel; to touch"),
            W("脉", "名", "mạch", "pulse; arteries and veins", "mài"), W("药方", "名", "đơn thuốc", "prescription"),
            W("按摩", "动", "xoa bóp", "to massage"), W("针灸", "名", "châm cứu", "acupuncture and moxibustion"),
            W("方法", "名", "phương pháp", "method"), W("治", "动", "điều trị; chữa", "to treat; to cure"),
            W("扎针", "动", "châm kim", "to give or have acupuncture treatment", "zhāzhēn"), W("细", "形", "nhỏ; mảnh", "thin; fine"),
            W("曾经", "副", "đã từng", "once; used to"), W("好", "副", "được; rất", "used before adjectives to indicate degree", "hǎo"),
            W("烤鸭", "名", "vịt quay", "roast duck"), W("烤", "动", "nướng; quay", "to roast; to bake"),
            W("第", "助", "thứ; tiền tố chỉ số thứ tự", "prefix indicating ordinal numbers"), W("中餐", "名", "món ăn Trung Quốc", "Chinese food"),
            W("白薯", "名", "khoai lang trắng", "sweet potato"), W("糖葫芦", "名", "kẹo hồ lô", "sugarcoated haws on a stick"),
            W("糖", "名", "đường; kẹo", "sugar"), W("什么的", "助", "vân vân; những thứ như...", "and so on"),
            W("亲耳", "副", "tận tai", "to hear on the spot"), W("钢琴", "名", "đàn piano", "piano"),
            W("家", "名", "chuyên gia; nhà chuyên môn", "specialist in a field", "jiā"), W("演奏", "动", "biểu diễn nhạc cụ", "to play a musical instrument"),
            W("极了", "补语", "cực kỳ; hết sức", "extremely; to the greatest extent"), W("小提琴", "名", "đàn violin", "violin"),
            W("协奏曲", "名", "bản hòa tấu", "concerto"), W("曲", "名", "khúc nhạc; giai điệu", "song; melody; concerto", "qǔ"),
            W("好听", "形", "dễ nghe; hay", "pleasing to the ear; melodious"), W("还", "动", "trả lại", "to return; to give back", "huán"),
            W("嘛", "助", "mà; trợ từ nhấn mạnh lẽ hiển nhiên", "modal particle indicating an obvious reason", "ma"),
        ],
        "grammar": [
            G("动词+过", "Động từ + 过 chỉ kinh nghiệm", "动词 + 过", "Biểu thị một hành động từng xảy ra trong quá khứ và thường đã kết thúc; trọng tâm là kinh nghiệm đã có.", "动态助词“过”表示过去曾经发生并已经停止的动作，强调经历。", [("我以前来过中国。", "Trước đây tôi từng đến Trung Quốc."), ("我没吃过北京烤鸭。", "Tôi chưa từng ăn vịt quay Bắc Kinh.")], 87),
            G("动量补语", "Bổ ngữ động lượng", "动词 + 了/过 + 数词 + 次/遍/声/趟/下", "Cho biết số lần hành động xảy ra. 了 hoặc 过 đứng sau động từ và trước cụm động lượng.", "动量补语说明动作发生的次数；“了、过”放在动词后、动量补语前。", [("这个电影我看过两遍。", "Tôi đã xem bộ phim này hai lượt."), ("他敲了一下儿门。", "Anh ấy gõ cửa một cái.")], 88),
            G("“次”和“遍”", "Phân biệt 次 và 遍", "动词 + 次/遍", "Cả hai đều đếm số lần; 遍 nhấn mạnh toàn bộ quá trình từ đầu đến cuối.", "“次”和“遍”都表示次数，“遍”强调从头到尾的全过程。", [("这本书我已经看过两遍了。", "Tôi đã đọc trọn cuốn sách này hai lượt."), ("这个电影我看了三次也没看完一遍。", "Tôi xem phim này ba lần mà vẫn chưa xem trọn một lượt.")], 89),
            G("序数的表达", "Cách biểu đạt số thứ tự", "第 + 数词", "Thêm 第 trước số từ để tạo số thứ tự; một số trường hợp như tháng, tầng hoặc cửa có thể không cần 第.", "数词前加“第”表示序数；有时数词本身也可以表示序数。", [("第一次", "Lần thứ nhất."), ("第四十一课", "Bài thứ bốn mươi mốt.")], 90),
        ],
        "phrases": [P("好借好还，再借不难嘛", "mượn dễ trả đúng hạn thì lần sau mượn không khó", "borrow properly and return in time; borrowing again will not be difficult", "Tục ngữ nhắc phải trả đồ mượn đúng hạn.", 86), P("一点儿也不……", "hoàn toàn không...", "not... at all", "Dùng để nhấn mạnh phủ định hoàn toàn.", 85, "yìdiǎnr yě bù...")],
    },
    6: {
        "title_zh": "我是跟旅游团一起来的", "title_vi": "Tôi đến cùng đoàn du lịch", "default_page": 100,
        "words": [
            W("前天", "名", "hôm kia", "the day before yesterday"), W("后天", "名", "ngày kia", "the day after tomorrow"),
            W("导游", "名", "hướng dẫn viên du lịch", "tourist guide"), W("研究生", "名", "nghiên cứu sinh", "graduate student"),
            W("打工", "动", "làm thuê; đi làm", "to do part-time work"), W("利用", "动", "tận dụng; sử dụng", "to make use of; to use"),
            W("假期", "名", "kỳ nghỉ", "holiday"), W("旅行社", "名", "công ty du lịch", "travel agency"),
            W("组织", "动、名", "tổ chức", "to organize; organization"), W("老板", "名", "ông chủ", "boss"),
            W("需要", "动、名", "cần; nhu cầu", "to need; need"), W("经常", "副", "thường xuyên", "usually; often"),
            W("收集", "动", "thu thập", "to gather; to collect"), W("一……就……", "连", "vừa... liền...; hễ... là...", "as soon as...; whenever...", "yī...jiù..."),
            W("安排", "动、名", "sắp xếp; sự sắp xếp", "to arrange; arrangement"), W("帮助", "动、名", "giúp đỡ; sự giúp đỡ", "to help; help"),
            W("帮", "动", "giúp", "to help"), W("希望", "动、名", "hy vọng", "to hope; hope"),
            W("铁路", "名", "đường sắt", "railway"), W("风光", "名", "phong cảnh", "scenery"),
            W("商量", "动", "thương lượng; bàn bạc", "to consult; to discuss"), W("故乡", "名", "quê hương", "birthplace; hometown"),
            W("自由", "形", "tự do", "free"), W("活动", "名、动", "hoạt động", "activity; to exercise"),
            W("互相", "副", "lẫn nhau", "each other"), W("老外", "名", "người nước ngoài", "international guest; foreigner"),
            W("呀", "助", "nhé; à", "sentence-final particle", "ya"), W("鼻子", "名", "mũi", "nose"),
            W("头发", "名", "tóc", "hair"), W("眼睛", "名", "mắt", "eye"), W("声调", "名", "thanh điệu", "tone of Chinese characters"),
        ],
        "grammar": [
            G("是……的", "Kết cấu 是……的", "主语 + 是 + 时间/地点/方式/目的 + 动词 + 的", "Nhấn mạnh thời gian, địa điểm, cách thức, mục đích hoặc người tham gia của hành động đã xảy ra. Trong câu khẳng định có thể lược 是; trong câu phủ định không lược.", "“是……的”强调已发生动作的时间、地点、方式、目的等；肯定句可省“是”，否定句不可省。", [("我们是从美国来的。", "Chúng tôi đến từ Mỹ."), ("我不是来旅行的，我是来留学的。", "Tôi không đến để du lịch, tôi đến để du học.")], 103),
            G("一……就……", "Vừa... liền... / hễ... là...", "一 + 动作1 + 就 + 动作2", "Có thể biểu thị hành động sau xảy ra ngay sau hành động trước, hoặc hành động trước là điều kiện/nguyên nhân dẫn đến kết quả sau.", "“一……就……”表示后一动作紧跟前一动作，或前一动作是后一结果的条件和原因。", [("今天我一下课就去看你。", "Hôm nay vừa tan học tôi sẽ đi thăm bạn."), ("我一感冒就咳嗽。", "Hễ bị cảm là tôi ho.")], 104),
            G("形容词重叠", "Lặp lại tính từ", "A→AA(儿)；AB→AABB + 地", "Tính từ một âm tiết thường lặp thành AA(儿); tính từ hai âm tiết thành AABB. Khi làm trạng ngữ, dạng lặp hai âm tiết thường đi với 地.", "单音节形容词可重叠为AA(儿)，双音节形容词重叠为AABB；作状语时一般带“地”。", [("别着急，你慢慢儿说。", "Đừng vội, bạn cứ nói từ từ."), ("高高兴兴地对我说。", "Vui vẻ nói với tôi.")], 105),
        ],
        "phrases": [P("马马虎虎", "tàm tạm; qua loa", "so-so; careless", "Có thể chỉ mức độ tạm được; trong ngữ cảnh phê bình còn mang nghĩa qua loa, không nghiêm túc.", 102)],
    },
    7: {
        "title_zh": "我的护照你找到了没有", "title_vi": "Em tìm thấy hộ chiếu của anh chưa", "default_page": 116,
        "words": [
            W("放", "动", "để; đặt", "to put"), W("半天", "名", "nửa ngày; khá lâu", "half a day; quite a while"),
            W("着", "补语", "đạt được kết quả của hành động", "result complement indicating attainment", "zháo"), W("签证", "名", "thị thực; visa", "visa"),
            W("手提包", "名", "túi xách", "bag; handbag"), W("交", "动", "giao; nộp", "to hand in"),
            W("好好儿", "副", "chăm chỉ; hết sức; cẩn thận", "to try one's best"), W("大衣", "名", "áo khoác", "overcoat"),
            W("口袋", "名", "túi áo", "pocket"), W("丢三落四", "形", "hay quên; trước quên sau", "forgetful", "diūsānlàsì"),
            W("丢", "动", "đánh mất", "to lose"), W("落", "动", "bỏ quên; để sót", "to forget to bring; to leave behind", "là"),
            W("发现", "动", "phát hiện", "to find out; to discover"), W("球迷", "名", "người hâm mộ bóng", "ball fan"),
            W("可", "副", "thật; quả là", "used for emphasis", "kě"), W("程度", "名", "mức độ", "extent; degree"),
            W("为了", "介", "vì; để", "for; in order to"), W("正常", "形", "bình thường", "normal; usual"),
            W("承认", "动", "thừa nhận", "to admit; to recognize"), W("发狂", "动", "phát cuồng", "to go mad; to be crazy"),
            W("锦标赛", "名", "giải vô địch", "tournament"), W("期间", "名", "trong thời gian; giai đoạn", "period"),
            W("像", "动", "giống; có vẻ như", "to look as if; to seem"), W("生病", "动", "bị bệnh", "to fall ill"),
            W("白天", "名", "ban ngày", "daytime"), W("精神", "形", "tỉnh táo; đầy sức sống", "vigorous; spirited"),
            W("贴", "动", "dán", "to paste; to attach"), W("通知", "名、动", "thông báo; báo cho", "notice; to give notice"),
            W("暂停", "动", "tạm dừng", "to suspend"), W("营业", "动", "kinh doanh; mở cửa", "to be in business"),
            W("够", "副", "đủ; đạt mức", "to reach a certain extent"), W("算", "动", "coi như; tính là", "to consider; to count as"),
            W("多的是", "惯用语", "có rất nhiều", "there are plenty"), W("亲眼", "副", "tận mắt", "with one's own eyes"),
            W("世界杯", "名", "World Cup; Cúp Thế giới", "the World Cup"), W("准", "动", "cho phép", "to allow; to permit"),
            W("辞职", "动", "từ chức; thôi việc", "to resign"), W("最后", "名", "cuối cùng", "final; last"),
            W("成", "动", "thành công; trở thành", "to succeed; to become"), W("佩服", "动", "khâm phục", "to admire; to think highly of"),
            W("棒", "形", "giỏi; tuyệt", "good; fine; excellent"),
        ],
        "grammar": [
            G("主谓谓语句", "Câu chủ-vị làm vị ngữ", "话题 + 主谓短语", "Đưa đối tượng lên đầu làm chủ đề rồi dùng một cụm chủ-vị để nhận xét hoặc miêu tả đối tượng đó.", "用主谓短语对句首话题加以说明或描写。", [("足球你喜欢吗？", "Bóng đá, bạn có thích không?"), ("我的护照你找到了没有？", "Hộ chiếu của tôi, bạn tìm thấy chưa?")], 119),
            G("结果补语“在”", "Bổ ngữ kết quả 在", "动词 + 在 + 处所", "Biểu thị qua hành động mà người hoặc vật được đặt ở một vị trí; tân ngữ thường là từ chỉ nơi chốn.", "“动词+在”表示通过动作使人或事物处于某处。", [("我的词典你放在哪儿了？", "Bạn để từ điển của tôi ở đâu rồi?"), ("这张画我们挂在哪儿呢？", "Bức tranh này chúng ta treo ở đâu?")], 120),
            G("结果补语“着”", "Bổ ngữ kết quả 着", "动词 + 着", "Biểu thị mục đích của hành động đã đạt được hoặc đã có kết quả.", "“动词+着”表示动作的目的达到了或有了结果。", [("我的护照你给我找着了没有？", "Bạn đã tìm thấy hộ chiếu giúp tôi chưa?"), ("你睡着了吗？", "Bạn đã ngủ thiếp đi chưa?")], 120),
            G("结果补语“好”", "Bổ ngữ kết quả 好", "动词 + 好", "Biểu thị hành động đã hoàn thành và đạt trạng thái hoàn chỉnh hoặc thỏa đáng.", "“动词+好”表示动作完成并达到完善、令人满意的程度。", [("你的衣服洗好了吗？", "Quần áo của bạn giặt xong chưa?"), ("我跟老板商量好了。", "Tôi đã bàn bạc xong với ông chủ.")], 120),
            G("结果补语“成”", "Bổ ngữ kết quả 成", "动词 + 成", "Biểu thị hành động đạt mục đích, làm sự vật biến đổi thành trạng thái khác hoặc tạo ra kết quả sai.", "“动词+成”表示达到目的、发生变化或出现错误结果。", [("这篇故事他翻译成了英语。", "Anh ấy đã dịch câu chuyện này sang tiếng Anh."), ("这个“我”字你写成“找”字了。", "Bạn đã viết chữ 我 thành chữ 找 rồi.")], 121),
        ],
        "phrases": [P("我看", "theo tôi; tôi nghĩ", "in my opinion; I think", "Đặt trước ý kiến hoặc nhận định riêng của người nói.", 118), P("多的是", "có rất nhiều", "there are plenty", "Dùng để nhấn mạnh số lượng nhiều, không thiếu.", 115)],
    },
    8: {
        "title_zh": "我的眼镜摔坏了", "title_vi": "Kính của tôi bị rơi hỏng rồi", "default_page": 130,
        "words": [
            W("照", "动", "chụp ảnh", "to take a photograph", "zhào"), W("洗", "动", "rửa; tráng ảnh", "to develop a film", "xǐ"),
            W("闭", "动", "nhắm; đóng", "to close"), W("油画", "名", "tranh sơn dầu", "oil painting"),
            W("放大", "动", "phóng to", "to enlarge"), W("倍", "量", "lần; gấp", "times; fold"),
            W("公分", "量", "xăng-ti-mét", "centimeter"), W("差一点儿", "副", "suýt; kém một chút", "almost", "chàyìdiǎnr"),
            W("碰", "动", "va; chạm; gặp", "to meet; to run into"), W("起", "量", "vụ; lượng từ cho sự cố", "classifier for accidents", "qǐ"),
            W("事故", "名", "sự cố; tai nạn", "accident"), W("整", "形", "trọn; nguyên; đầy", "full; whole"),
            W("眼镜", "名", "kính mắt", "glasses"), W("别提了", "惯用语", "đừng nhắc nữa", "don't mention it"),
            W("倒霉", "形", "xui xẻo", "being down on one's luck"), W("摔跤", "动", "ngã; té", "to have a fall"),
            W("摔", "动", "rơi; ném; quăng", "to fall; to throw"), W("掉", "动", "rơi; rớt", "to drop", "diào"),
            W("地上", "名", "mặt đất; dưới đất", "ground"), W("上班", "动", "đi làm", "to go to work; to be on duty"),
            W("下班", "动", "tan làm", "to go off work"), W("保证", "动", "bảo đảm; cam đoan", "to guarantee"),
            W("遵守", "动", "tuân thủ", "to abide by"), W("规则", "名", "quy tắc; luật", "rule"),
            W("造成", "动", "gây ra; tạo thành", "to cause; to bring about"), W("拥挤", "形、动", "chen chúc; chật chội", "to be crowded; crowded"),
            W("主要", "形", "chủ yếu; chính", "main"), W("原因", "名", "nguyên nhân", "reason"),
            W("之一", "代", "một trong những", "one of"), W("引起", "动", "gây ra; dẫn tới", "to cause"),
            W("赶快", "副", "nhanh lên; mau chóng", "hurriedly; quickly"), W("发展", "动", "phát triển", "to develop"),
        ],
        "grammar": [
            G("无标志被动句", "Câu bị động không có dấu hiệu", "受事主语 + 动词 + 结果补语", "Khi chủ ngữ là đối tượng chịu tác động, câu có thể mang nghĩa bị động mà không cần 被; thường nhấn mạnh kết quả của hành động.", "句子的主语可以是动作接受者；强调动作对象的结果时可以用无标志被动句。", [("我的眼镜摔坏了。", "Kính của tôi bị rơi hỏng rồi."), ("照片洗好了。", "Ảnh đã được tráng xong.")], 134),
            G("量词重叠", "Lặp lại lượng từ", "量词 → AA", "Danh lượng từ và động lượng từ có thể lặp lại để biểu thị ý nghĩa “mỗi”.", "名量词和动量词都可以重叠，表示“每”的意思。", [("这些照片张张照得都很好。", "Những bức ảnh này tấm nào chụp cũng đẹp."), ("我们班的同学个个都很努力。", "Học sinh lớp chúng tôi ai cũng chăm chỉ.")], 134),
            G("一年比一年", "Mỗi năm một...", "一年比一年 + 形容词", "Làm trạng ngữ để chỉ mức độ thay đổi tăng dần theo thời gian; tương tự có 一天比一天.", "“一年比一年”说明事物随时间推移而程度递增；也可以说“一天比一天”。", [("有汽车的人一年比一年多。", "Số người có ô tô mỗi năm một nhiều."), ("来中国以后，我一天比一天胖。", "Sau khi đến Trung Quốc, tôi béo lên từng ngày.")], 135),
            G("差点儿", "Suýt nữa", "差点儿 + 动词", "Với việc xấu, dạng khẳng định và phủ định đều có thể chỉ việc cuối cùng không xảy ra. Với việc tốt, khẳng định thường chỉ tiếc vì không thành, còn phủ định chỉ may vì cuối cùng đã thành.", "“差点儿”表示事情几乎发生；好事和坏事以及肯定、否定形式会影响最终结果。", [("今天早上我差点儿迟到。", "Sáng nay tôi suýt đến muộn."), ("只有这一个了，我差点儿没买到。", "Chỉ còn một cái, tôi suýt không mua được.")], 133),
        ],
        "phrases": [P("不怎么样", "không ra sao; không tốt lắm", "not very good", "Biểu thị người nói không hài lòng.", 132), P("别提了", "đừng nhắc nữa", "don't mention it", "Dùng khi sự việc khiến người nói bực, buồn hoặc không muốn nhắc lại.", 132), P("倒霉得很", "xui xẻo lắm", "very unlucky", "Mẫu 得很 làm bổ ngữ mức độ cao.", 133)],
    },
    9: {
        "title_zh": "钥匙忘拔下来了", "title_vi": "Quên rút chìa khóa ra rồi", "default_page": 143,
        "words": [
            W("图书城", "名", "siêu thị sách; khu bán sách", "book bazaar"), W("图书", "名", "sách", "book"),
            W("进去", "动", "đi vào", "to enter"), W("各种各样", "形", "đủ loại", "all sorts"),
            W("各", "代", "mỗi; các", "each"), W("样", "名", "loại; kiểu", "kind; type"),
            W("兴奋", "形", "hào hứng; phấn khởi", "excited"), W("书架", "名", "giá sách", "bookshelf"),
            W("下来", "动", "xuống; hướng xuống hoặc lại gần", "to come down; down"), W("抽", "动", "rút ra", "to take something from within"),
            W("挑", "动", "chọn lựa", "to choose; to select", "tiāo"), W("选", "动", "lựa chọn", "to choose; to select"),
            W("小说", "名", "tiểu thuyết", "novel"), W("回去", "动", "quay về", "to go back; to return"),
            W("除了……以外", "介", "ngoài... ra", "besides; apart from; except", "chúle...yǐwài"), W("于是", "连", "thế là; vì vậy", "so; then; thereupon"),
            W("音像", "名", "nghe nhìn; phương tiện nghe nhìn", "audiovisual media"), W("这里", "代", "ở đây", "here"),
            W("那里", "代", "ở kia", "there"), W("根据", "介", "căn cứ theo", "on the basis of; according to"),
            W("拍", "动", "chụp; quay phim", "to shoot a photograph or movie"), W("盒", "量", "hộp", "box"),
            W("下", "形", "sau; tiếp theo", "next", "xià"), W("学期", "名", "học kỳ", "school term"),
            W("纸箱", "名", "thùng giấy", "carton"), W("纸", "名", "giấy", "paper"),
            W("饭馆", "名", "nhà hàng; quán ăn", "restaurant; eatery"), W("盘", "量", "đĩa", "plate"),
            W("累", "形", "mệt", "tired"), W("困", "形", "buồn ngủ; kiệt sức", "sleepy; exhausted"),
            W("电梯", "名", "thang máy", "lift; elevator"), W("维修", "动", "bảo trì; sửa chữa", "to maintain and repair"),
            W("修", "动", "sửa", "to repair"), W("楼梯", "名", "cầu thang", "stairs; stairway"),
            W("只好", "副", "đành phải", "have to; cannot but"), W("提", "动", "xách; nhấc", "to carry in one's hand"),
            W("步", "量", "bước", "step"), W("钥匙", "名", "chìa khóa", "key"),
            W("却", "副", "nhưng; lại", "but; yet"), W("忽然", "副", "bỗng nhiên", "suddenly; unexpectedly"),
            W("想起来", "动", "nhớ ra", "to remember"), W("起来", "动", "đứng dậy; bắt đầu; hoàn thành hướng lên", "directional/result complement", "qǐlái"),
            W("插", "动", "cắm; chèn", "to stick in; to insert"), W("拔", "动", "rút ra", "to pull out"),
            W("哭笑不得", "惯用语", "dở khóc dở cười", "not know whether to laugh or cry"),
        ],
        "grammar": [
            G("复合趋向补语", "Bổ ngữ xu hướng kép", "动词 + 上/下/进/出/回/过/起 + 来/去", "Kết hợp động từ xu hướng với 来 hoặc 去 sau một động từ khác để biểu thị hướng vận động.", "趋向动词“上、下、进、出、回、过、起”加“来/去”放在另一动词后作复合趋向补语。", [("她走出学校去了。", "Cô ấy đi ra khỏi trường."), ("我买回来一本书。", "Tôi mua về một cuốn sách.")], 147),
            G("复合趋向补语和宾语", "Vị trí tân ngữ với bổ ngữ xu hướng kép", "动词 + 趋向补语 + 宾语", "Tân ngữ chỉ nơi chốn bắt buộc đứng trước 来/去; tân ngữ chỉ sự vật có thể đứng trước hoặc sau 来/去.", "处所宾语一定放在“来/去”之前；事物宾语可放在“来/去”前或后。", [("我看见他走进图书馆去了。", "Tôi nhìn thấy anh ấy đi vào thư viện."), ("他从国外给我带回来一件礼物。", "Anh ấy mang từ nước ngoài về cho tôi một món quà.")], 148),
            G("复合趋向补语中的“了”", "Vị trí 了 với bổ ngữ xu hướng kép", "动词 + 了 + 趋向补语 / 动词 + 趋向补语 + 了", "Không có tân ngữ, 了 có thể đứng sau động từ hoặc cuối câu. Có tân ngữ nơi chốn, 了 ở cuối câu; có tân ngữ sự vật, 了 đứng sau bổ ngữ và trước tân ngữ.", "无宾语时“了”可在动词后或句末；有处所宾语时在句末；有事物宾语时在补语后、宾语前。", [("同学们都跑出去了。", "Các bạn học sinh đều chạy ra ngoài rồi."), ("我给你买回来了一件羽绒服。", "Tôi đã mua về cho bạn một chiếc áo lông vũ.")], 149),
        ],
        "phrases": [P("哭笑不得", "dở khóc dở cười", "not know whether to laugh or cry", "Dùng khi sự việc vừa buồn cười vừa gây khó chịu hoặc bất lực.", 143), P("想起来", "nhớ ra", "to remember", "Biểu thị một thông tin chợt trở lại trong trí nhớ.", 146)],
    },
    10: {
        "title_zh": "会议厅的门开着呢", "title_vi": "Cửa phòng họp vẫn đang mở", "default_page": 160,
        "words": [
            W("会议厅", "名", "phòng hội nghị", "conference or assembly hall"), W("厅", "名", "đại sảnh; phòng lớn", "hall"),
            W("中心", "名", "trung tâm", "center"), W("服务员", "名", "nhân viên phục vụ", "attendant; steward; waiter"),
            W("长", "动", "lớn lên; phát triển", "to grow; to develop", "zhǎng"), W("个子", "名", "vóc dáng; chiều cao", "height; stature"),
            W("左右", "名", "khoảng; xấp xỉ", "about; or so"), W("戴", "动", "đội; đeo", "to wear on the head, face, neck or arm"),
            W("着", "助", "đang; biểu thị trạng thái tiếp diễn", "particle indicating continuation", "zhe"), W("副", "量", "chiếc; cặp; bộ", "pair; set", "fù"),
            W("穿", "动", "mặc", "to wear"), W("西服", "名", "âu phục; com-lê", "western suit"),
            W("裙子", "名", "váy", "skirt"), W("干", "动", "làm", "to do", "gàn"),
            W("主持人", "名", "người dẫn chương trình", "host; hostess; anchorperson"), W("主持", "动", "chủ trì; dẫn chương trình", "to preside over; to take charge of"),
            W("小伙子", "名", "chàng trai", "young man; lad"), W("扛", "动", "vác trên vai", "to carry on the shoulder", "káng"),
            W("摄像机", "名", "máy quay phim", "video camera"), W("麦克风", "名", "micro", "microphone"),
            W("讲话", "动", "nói; nói chuyện", "to speak; to talk"), W("墙", "名", "tường", "wall"),
            W("喜", "形", "vui", "happy"), W("婚礼", "名", "hôn lễ; đám cưới", "wedding"),
            W("热闹", "形", "náo nhiệt", "lively"), W("挂", "动", "treo", "to hang"),
            W("灯笼", "名", "đèn lồng", "lantern"), W("摆", "动", "bày; sắp xếp", "to put; to place"),
            W("新娘", "名", "cô dâu", "bride"), W("棉袄", "名", "áo bông", "padded coat"),
            W("新郎", "名", "chú rể", "bridegroom"), W("帅", "形", "đẹp trai", "handsome; smart"),
            W("领带", "名", "cà vạt", "necktie"), W("热情", "形", "nhiệt tình", "warm; enthusiastic"),
            W("客人", "名", "khách", "guest"), W("倒", "动", "rót", "to pour", "dào"),
            W("不停", "副", "không ngừng", "incessantly"), W("气氛", "名", "không khí; bầu không khí", "atmosphere"),
        ],
        "grammar": [
            G("动词+着", "Động từ + 着 chỉ sự tiếp diễn", "动词 + 着", "着 sau động từ biểu thị hành động hoặc trạng thái đang tiếp tục, chủ yếu dùng để miêu tả.", "动词后加动态助词“着”，表示动作或状态的持续，主要用于描写。", [("墙上贴着红双喜字。", "Trên tường đang dán chữ song hỷ màu đỏ."), ("她穿着一件红西服。", "Cô ấy đang mặc một bộ com-lê đỏ.")], 162),
            G("没（有）……着", "Phủ định của 着", "没（有）+ 动词 + 着", "Dùng để phủ định trạng thái tiếp diễn hoặc trạng thái đang tồn tại, nhưng trong giao tiếp không dùng nhiều.", "否定式是“没（有）……着”，但交际中很少用。", [("教室的门没开着。", "Cửa lớp không mở."), ("书上没写着名字。", "Trên sách không ghi tên.")], 163),
            G("动词+着+动词", "着 trong câu liên động", "动词1 + 着 + 动词2", "Động từ thứ nhất kèm 着 mô tả trạng thái hoặc cách thức khi hành động thứ hai diễn ra.", "“动词+着”用于连动句第二个动词前，说明第二个动作进行时的状态或方式。", [("她正在前边站着讲话呢。", "Cô ấy đang đứng phía trước nói chuyện."), ("我们走着去吧。", "Chúng ta đi bộ tới đó nhé.")], 163),
            G("着与正在/正/在/呢", "着 kết hợp với 正在, 正, 在, 呢", "正在/正/在 + 动词 + 着 + 呢", "着 thường phối hợp với 正在、正、在、呢 để làm rõ hành động hoặc trạng thái đang tiếp diễn.", "“动词+着”常和“正在、正、在、呢”等词连用。", [("里边正上着课呢。", "Bên trong đang học."), ("老师没在前面坐着，他站着呢。", "Giáo viên không ngồi phía trước, thầy đang đứng.")], 163),
        ],
        "phrases": [P("长得什么样", "trông như thế nào", "what does someone look like", "Dùng để hỏi ngoại hình của một người.", 160), P("开着呢", "vẫn đang mở", "is still open", "着 biểu thị trạng thái mở đang được duy trì; 呢 tăng sắc thái đang tiếp diễn.", 160)],
    },
}


def pinyin_word(text: str) -> str:
    clean = text.replace("……", "...").replace("…", "...")
    parts = lazy_pinyin(clean, style=Style.TONE, neutral_tone_with_five=False, errors=lambda x: list(x))
    return "".join(parts)


def pinyin_sentence(text: str) -> str:
    result = lazy_pinyin(text, style=Style.TONE, neutral_tone_with_five=False, errors=lambda x: list(x))
    # In the lesson examples these characters are aspect/structural particles,
    # not their lexical readings de2, di4, and guo4.
    particle_readings = {"得": "de", "地": "de", "过": "guo"}
    for index, char in enumerate(text):
        if char in particle_readings and index < len(result):
            result[index] = particle_readings[char]
    out = " ".join(result)
    out = re.sub(r"\s+([，。！？；：,.!?;:])", r"\1", out)
    if out:
        out = out[0].upper() + out[1:]
    return out


def page_for_word(source_lines: list[str], word: str, default_page: int) -> int:
    start = next((i for i, line in enumerate(source_lines) if "生词" in line), 0)
    end = next((i for i, line in enumerate(source_lines[start + 1 :], start + 1) if "练习" in line), len(source_lines))
    page = default_page
    for line in source_lines[start:end]:
        match = re.search(r"TRANG\s+(\d+)", line)
        if match:
            page = int(match.group(1))
        if word in line:
            return page
    return default_page


def type_tags(word_type: str) -> list[str]:
    tags = ["tu_vung"]
    for marker, tag in TYPE_TAGS.items():
        if marker in word_type and tag not in tags:
            tags.append(tag)
    return tags


def build_lesson(number: int, lesson: dict, generated_at: str) -> dict:
    code = f"bai{number:02d}"
    source_rel = f"data/_extracted/bai/{code}.txt"
    source_path = ROOT / source_rel
    source_lines = source_path.read_text(encoding="utf-8", errors="replace").splitlines()
    exercise_line = next((i for i, line in enumerate(source_lines) if "练习" in line), len(source_lines))
    source_before_exercises = "\n".join(source_lines[:exercise_line])

    entries = []
    word_ids = {}
    for index, spec in enumerate(lesson["words"], 1):
        word_id = f"{code}_w{index:03d}"
        word_ids[spec["zh"]] = word_id
        confidence = spec["confidence"]
        note = spec["note"]
        if spec["zh"] not in source_before_exercises and note is None:
            confidence = "medium"
            note = "Mục từ được phục hồi từ hàng pinyin/nghĩa bị lệch cột trong OCR."
        entries.append({
            "id": word_id,
            "bai": number,
            "type": "word",
            "word_zh": spec["zh"],
            "pinyin": spec["pinyin"] or pinyin_word(spec["zh"]),
            "word_type": spec["word_type"],
            "meaning_vi": spec["vi"],
            "meaning_en": spec["en"],
            "example_zh": None,
            "example_pinyin": None,
            "example_vi": None,
            "grammar_note": None,
            "related_words": [],
            "tags": type_tags(spec["word_type"]),
            "page": page_for_word(source_lines, spec["zh"], lesson["default_page"]),
            "confidence": confidence,
            "note": note,
        })

    for index, spec in enumerate(lesson["grammar"], 1):
        example_entries = [{"zh": zh, "pinyin": pinyin_sentence(zh), "vi": vi} for zh, vi in spec["examples"]]
        haystack = spec["title_zh"] + spec["structure"] + "".join(zh for zh, _ in spec["examples"])
        related = [word_id for word, word_id in word_ids.items() if word in haystack][:8]
        entries.append({
            "id": f"{code}_g{index:03d}",
            "bai": number,
            "type": "grammar",
            "grammar_title_zh": spec["title_zh"],
            "grammar_title_vi": spec["title_vi"],
            "structure": spec["structure"],
            "explanation_vi": spec["explanation_vi"],
            "explanation_zh": spec["explanation_zh"],
            "examples": example_entries,
            "related_words": related,
            "tags": ["ngu_phap"],
            "page": spec["page"],
            "confidence": "high",
            "note": None,
        })

    for index, spec in enumerate(lesson["phrases"], 1):
        related = [word_id for word, word_id in word_ids.items() if word in spec["zh"] or spec["zh"] in word][:8]
        entries.append({
            "id": f"{code}_p{index:03d}",
            "bai": number,
            "type": "phrase",
            "phrase_zh": spec["zh"],
            "pinyin": spec["pinyin"] or pinyin_sentence(spec["zh"]).rstrip("。！？"),
            "meaning_vi": spec["vi"],
            "meaning_en": spec["en"],
            "usage_note": spec["usage"],
            "related_words": related,
            "tags": ["mau_cau", "khau_ngu"],
            "page": spec["page"],
            "confidence": "high",
            "note": None,
        })

    counts = {kind: sum(entry["type"] == kind for entry in entries) for kind in ("word", "grammar", "phrase")}
    return {
        "metadata": {
            "bai": number,
            "title_zh": lesson["title_zh"],
            "title_vi": lesson["title_vi"],
            "source_file": source_rel,
            "total_entries": len(entries),
            "word_count": counts["word"],
            "grammar_count": counts["grammar"],
            "phrase_count": counts["phrase"],
            "generated_at": generated_at,
            "version": "1.0",
        },
        "entries": entries,
    }


def validate_lesson(payload: dict) -> list[str]:
    errors = []
    entries = payload["entries"]
    ids = [entry["id"] for entry in entries]
    if len(ids) != len(set(ids)):
        errors.append("duplicate id")
    id_set = set(ids)
    for entry in entries:
        for related in entry.get("related_words", []):
            if related not in id_set:
                errors.append(f"dangling related_words: {entry['id']} -> {related}")
        serialized = json.dumps(entry, ensure_ascii=False)
        if re.search(r"[\uac00-\ud7af]", serialized):
            errors.append(f"Korean text found: {entry['id']}")
        if entry.get("confidence") == "low" and not entry.get("note"):
            errors.append(f"low confidence without note: {entry['id']}")
    meta = payload["metadata"]
    if meta["total_entries"] != len(entries):
        errors.append("metadata total_entries mismatch")
    return errors


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    index_items = []
    total_entries = 0
    all_errors = []

    for number in range(1, 11):
        payload = build_lesson(number, LESSONS[number], generated_at)
        errors = validate_lesson(payload)
        if errors:
            all_errors.extend(f"bai{number:02d}: {error}" for error in errors)
            continue
        output_name = f"glossary_bai{number:02d}.json"
        output_path = data_dir / output_name
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # Parse the exact bytes written to disk before including the file in the index.
        reparsed = json.loads(output_path.read_text(encoding="utf-8"))
        count = reparsed["metadata"]["total_entries"]
        index_items.append({"bai": number, "file": output_name, "entries": count})
        total_entries += count

    if all_errors:
        raise SystemExit("\n".join(all_errors))

    index_payload = {
        "total_bai": len(index_items),
        "total_entries": total_entries,
        "bais": index_items,
        "generated_at": generated_at,
        "version": "1.0",
    }
    index_path = data_dir / "glossary_index.json"
    index_path.write_text(json.dumps(index_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    json.loads(index_path.read_text(encoding="utf-8"))
    print(json.dumps(index_payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
