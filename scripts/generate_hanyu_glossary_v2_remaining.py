from __future__ import annotations

import difflib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".codex_deps"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pypinyin import Style, lazy_pinyin  # noqa: E402

from generate_hanyu_glossary import LESSONS, type_tags  # noqa: E402


EXERCISE_LINES = {2: 410, 3: 636, 4: 425, 5: 637, 6: 468, 7: 488, 8: 414, 9: 522, 10: 346}
GRAMMAR_START_LINES = {2: 323, 3: 550, 4: 373, 5: 498, 6: 357, 7: 385, 8: 359, 9: 402, 10: 278}
SOURCE_LINE_OVERRIDES = {
    (2, "春天"): 102, (2, "秋天"): 104, (2, "刮风"): 107, (2, "下雨"): 135,
    (3, "避暑"): 133, (3, "发财"): 139, (3, "落"): 146, (3, "着急"): 333, (3, "父亲"): 353,
    (4, "开会"): 91, (4, "捎"): 144, (4, "办事"): 160, (4, "差不多"): 226, (4, "省"): 230,
    (5, "住院"): 178, (6, "一……就……"): 168, (8, "倍"): 126, (8, "差一点儿"): 147,
    (9, "除了……以外"): 111, (9, "音像"): 115, (9, "盒"): 242, (9, "楼梯"): 259,
    (9, "插"): 389, (9, "哭笑不得"): 393,
    (10, "扛"): 196, (10, "热闹"): 222, (10, "棉袄"): 230,
}

# Selected clean sentences from the lesson text. Everything else is explicitly marked ai_inferred.
DOCUMENT_EXAMPLES = {
    (2, "一样"): ("我们那儿的冬天跟北京一样冷。", "Mùa đông chỗ chúng tôi lạnh như Bắc Kinh."),
    (2, "冷"): ("我们那儿的冬天跟北京一样冷。", "Mùa đông chỗ chúng tôi lạnh như Bắc Kinh."),
    (2, "时差"): ("我们那儿跟北京有七个小时的时差呢。", "Chỗ chúng tôi lệch Bắc Kinh bảy tiếng."),
    (3, "滑冰"): ("我爱滑冰，也爱滑雪。", "Tôi thích trượt băng, cũng thích trượt tuyết."),
    (3, "滑雪"): ("我爱滑冰，也爱滑雪。", "Tôi thích trượt băng, cũng thích trượt tuyết."),
    (3, "有名"): ("我们家乡是有名的风景区。", "Quê chúng tôi là khu phong cảnh nổi tiếng."),
    (3, "风景"): ("我们家乡是有名的风景区。", "Quê chúng tôi là khu phong cảnh nổi tiếng."),
    (3, "凉快"): ("尤其是夏天，山里很凉快。", "Đặc biệt vào mùa hè, trong núi rất mát."),
    (4, "开车"): ("快上来吧，要开车了。", "Mau lên đây, xe sắp chạy rồi."),
    (4, "上来"): ("快上来吧，要开车了。", "Mau lên đây, xe sắp chạy rồi."),
    (4, "研讨会"): ("你不是到台湾开汉语教学研讨会去了吗？", "Chẳng phải cô đã đến Đài Loan dự hội thảo giảng dạy tiếng Trung sao?"),
    (5, "过"): ("来中国以后我已经得过三次感冒了。", "Sau khi đến Trung Quốc, tôi đã từng bị cảm ba lần."),
    (5, "住院"): ("我还住过一次院呢。", "Tôi còn từng nằm viện một lần."),
    (5, "中医"): ("我看过中医，也吃过中药。", "Tôi từng khám đông y và cũng từng uống thuốc bắc."),
    (6, "老外"): ("中国人一听就知道我是老外。", "Người Trung Quốc vừa nghe là biết tôi là người nước ngoài."),
    (6, "马马虎虎"): ("我汉语说得马马虎虎。", "Tiếng Trung của tôi nói chỉ tạm được."),
    (7, "半天"): ("我找了半天也没找着。", "Tôi tìm khá lâu mà vẫn chưa thấy."),
    (7, "签证"): ("昨天你办完签证放在什么地方了？", "Hôm qua làm xong visa, anh để ở đâu rồi?"),
    (7, "手提包"): ("放在我的手提包里了。", "Đã để trong túi xách của tôi rồi."),
    (7, "好好儿"): ("我再好好儿找找。", "Tôi sẽ tìm lại thật kỹ."),
    (8, "眼镜"): ("我的眼镜摔坏了。", "Kính của tôi bị rơi hỏng rồi."),
    (8, "别提了"): ("别提了，今天倒霉得很。", "Đừng nhắc nữa, hôm nay xui xẻo lắm."),
    (8, "倒霉"): ("别提了，今天倒霉得很。", "Đừng nhắc nữa, hôm nay xui xẻo lắm."),
    (8, "差一点儿"): ("今天早上我差点儿迟到。", "Sáng nay tôi suýt đến muộn."),
    (9, "进去"): ("每个书店我都想进去看看。", "Hiệu sách nào tôi cũng muốn vào xem."),
    (9, "各种各样"): ("书店里有各种各样的书。", "Trong hiệu sách có đủ loại sách."),
    (9, "书架"): ("我从这个书架上拿下来一本看看。", "Tôi lấy một cuốn từ giá sách này xuống xem."),
    (9, "小说"): ("麦克选了一些中文小说。", "Mike chọn một số tiểu thuyết tiếng Trung."),
    (9, "回去"): ("我们都想买一些书带回国去。", "Chúng tôi đều muốn mua vài cuốn sách mang về nước."),
    (10, "着"): ("会议厅的门开着呢。", "Cửa phòng họp vẫn đang mở."),
    (10, "个子"): ("她个子高高的。", "Cô ấy có vóc dáng cao."),
    (10, "戴"): ("她戴着一副眼镜。", "Cô ấy đang đeo một chiếc kính."),
    (10, "西服"): ("她穿着一件红色的西服。", "Cô ấy đang mặc một bộ com-lê màu đỏ."),
    (10, "主持人"): ("她是电视台的主持人。", "Cô ấy là người dẫn chương trình của đài truyền hình."),
    (10, "摄像机"): ("两个小伙子扛着摄像机。", "Hai chàng trai đang vác máy quay phim."),
    (10, "麦克风"): ("主持人拿着麦克风讲话。", "Người dẫn chương trình cầm micro nói chuyện."),
}

# Natural examples for function words, classifiers, complements, and verbs that do not fit a generic pattern.
SPECIAL_EXAMPLES = {
    (2, "不但……而且……"): ("他不但会汉语，而且会英语。", "Anh ấy không những biết tiếng Trung mà còn biết tiếng Anh."),
    (2, "得"): ("他考试得了九十分。", "Anh ấy thi được chín mươi điểm."),
    (2, "分"): ("她考试得了九十五分。", "Cô ấy thi được chín mươi lăm điểm."),
    (2, "只是"): ("我想去，只是今天很忙。", "Tôi muốn đi, chỉ là hôm nay rất bận."),
    (3, "落"): ("秋天树叶落了。", "Mùa thu lá cây rụng rồi."),
    (3, "表"): ("我的表没电了。", "Đồng hồ của tôi hết pin rồi."),
    (3, "该"): ("我们该走了。", "Chúng ta nên đi rồi."),
    (3, "了"): ("天气变冷了。", "Thời tiết trở lạnh rồi."),
    (3, "地"): ("她高兴地告诉我。", "Cô ấy vui vẻ nói với tôi."),
    (3, "这样"): ("请不要这样说。", "Xin đừng nói như vậy."),
    (3, "那样"): ("事情不是那样。", "Sự việc không phải như thế."),
    (4, "向"): ("他向老师问好。", "Anh ấy gửi lời hỏi thăm thầy giáo."),
    (4, "过去"): ("我现在过去取。", "Bây giờ tôi sang lấy."),
    (4, "过来"): ("请你马上过来。", "Bạn hãy đến đây ngay."),
    (4, "趟"): ("我去了一趟上海。", "Tôi đã đi Thượng Hải một chuyến."),
    (4, "马上"): ("我马上就回来。", "Tôi sẽ quay lại ngay."),
    (4, "大约"): ("大约要两个小时。", "Khoảng hai tiếng."),
    (4, "省"): ("这样可以省时间。", "Làm vậy có thể tiết kiệm thời gian."),
    (5, "什么的"): ("我买了糖果、白薯什么的。", "Tôi mua kẹo, khoai lang và những thứ tương tự."),
    (5, "第"): ("这是第一次。", "Đây là lần thứ nhất."),
    (5, "家"): ("他是一位音乐家。", "Ông ấy là một nhạc sĩ."),
    (5, "极了"): ("这支歌好听极了。", "Bài hát này hay vô cùng."),
    (5, "曲"): ("我喜欢这支曲。", "Tôi thích khúc nhạc này."),
    (5, "还"): ("听完就还给你。", "Nghe xong sẽ trả lại cho bạn."),
    (5, "嘛"): ("好借好还，再借不难嘛。", "Mượn rồi trả đúng hạn thì lần sau mượn không khó mà."),
    (6, "一……就……"): ("我一下课就回宿舍。", "Vừa tan học là tôi về ký túc xá."),
    (6, "互相"): ("同学们互相帮助。", "Các bạn học giúp đỡ lẫn nhau."),
    (6, "呀"): ("你慢慢说呀。", "Bạn cứ từ từ nói nhé."),
    (7, "着"): ("我的护照找着了。", "Hộ chiếu của tôi đã tìm thấy rồi."),
    (7, "可"): ("他可喜欢足球了。", "Anh ấy thật sự rất thích bóng đá."),
    (7, "为了"): ("为了看球，他请假了。", "Để xem bóng đá, anh ấy đã xin nghỉ."),
    (7, "够"): ("这些钱够了。", "Số tiền này đủ rồi."),
    (7, "算"): ("这也算成功。", "Điều này cũng coi như thành công."),
    (7, "多的是"): ("喜欢足球的人多的是。", "Người thích bóng đá có rất nhiều."),
    (7, "准"): ("老板不准他辞职。", "Ông chủ không cho phép anh ấy nghỉ việc."),
    (7, "成"): ("这件事终于办成了。", "Việc này cuối cùng đã làm thành công."),
    (8, "照"): ("我们在长城照相。", "Chúng tôi chụp ảnh ở Vạn Lý Trường Thành."),
    (8, "倍"): ("照片放大了两倍。", "Bức ảnh được phóng to gấp hai lần."),
    (8, "公分"): ("这张照片长十公分。", "Bức ảnh này dài mười xăng-ti-mét."),
    (8, "起"): ("发生了一起事故。", "Đã xảy ra một vụ tai nạn."),
    (8, "之一"): ("交通是问题之一。", "Giao thông là một trong các vấn đề."),
    (9, "各"): ("各书店都有中文书。", "Mỗi hiệu sách đều có sách tiếng Trung."),
    (9, "下"): ("下学期我学习小说。", "Học kỳ sau tôi học tiểu thuyết."),
    (9, "除了……以外"): ("除了买书以外，我还买光盘。", "Ngoài mua sách, tôi còn mua đĩa."),
    (9, "于是"): ("天很晚了，于是我们回去了。", "Trời đã muộn, vì vậy chúng tôi về."),
    (9, "根据"): ("电影是根据小说拍的。", "Bộ phim được quay dựa theo tiểu thuyết."),
    (9, "盒"): ("我买了一盒光盘。", "Tôi mua một hộp đĩa."),
    (9, "盘"): ("我们点了一盘菜。", "Chúng tôi gọi một đĩa thức ăn."),
    (9, "只好"): ("电梯坏了，只好走楼梯。", "Thang máy hỏng nên đành đi cầu thang."),
    (9, "步"): ("他往前走了几步。", "Anh ấy đi về phía trước vài bước."),
    (9, "却"): ("我很累，却睡不着。", "Tôi rất mệt nhưng lại không ngủ được."),
    (9, "起来"): ("我忽然想起来了。", "Tôi bỗng nhớ ra rồi."),
    (10, "长"): ("孩子已经长高了。", "Đứa trẻ đã lớn cao lên."),
    (10, "左右"): ("她大概一米七左右。", "Cô ấy cao khoảng một mét bảy."),
    (10, "副"): ("她戴着一副眼镜。", "Cô ấy đang đeo một chiếc kính."),
    (10, "干"): ("你在干什么？", "Bạn đang làm gì?"),
    (10, "扛"): ("他扛着摄像机。", "Anh ấy đang vác máy quay phim."),
    (10, "倒"): ("请给客人倒茶。", "Hãy rót trà cho khách."),
    (10, "不停"): ("他不停地讲话。", "Anh ấy nói không ngừng."),
}

SPECIAL_EXAMPLES.update({
    (2, "刮风"): ("今天又刮风了。", "Hôm nay lại có gió rồi."),
    (2, "下雪"): ("冬天这里常常下雪。", "Mùa đông ở đây thường có tuyết."),
    (2, "下雨"): ("今天下午可能下雨。", "Chiều nay có thể mưa."),
    (2, "产生"): ("改革以后产生了变化。", "Sau cải cách đã nảy sinh thay đổi."),
    (2, "老"): ("这本画册很老。", "Tập tranh này rất cũ."),
    (2, "开放"): ("这里已经开放了。", "Nơi đây đã mở cửa rồi."),
    (3, "爱"): ("我爱滑冰和滑雪。", "Tôi thích trượt băng và trượt tuyết."),
    (3, "靠"): ("他们靠经营旅馆发财。", "Họ dựa vào kinh doanh khách sạn để làm giàu."),
    (3, "发财"): ("他们靠经营旅馆发财。", "Họ dựa vào kinh doanh khách sạn để làm giàu."),
    (3, "着急"): ("别着急，时间还早。", "Đừng sốt ruột, vẫn còn sớm."),
    (3, "坏"): ("我的表坏了。", "Đồng hồ của tôi hỏng rồi."),
    (3, "停"): ("我的表突然停了。", "Đồng hồ của tôi đột nhiên dừng rồi."),
    (3, "迟到"): ("他今天上课迟到了。", "Hôm nay anh ấy đi học muộn."),
    (3, "结婚"): ("姐姐下个月结婚。", "Tháng sau chị gái kết hôn."),
    (3, "离婚"): ("他们已经离婚了。", "Họ đã ly hôn rồi."),
    (4, "送"): ("我给老师送去礼物。", "Tôi mang quà tới tặng giáo viên."),
    (4, "经过"): ("汽车经过大使馆。", "Ô tô đi qua đại sứ quán."),
    (4, "问好"): ("请向老师问好。", "Hãy gửi lời hỏi thăm tới giáo viên."),
    (4, "捎"): ("我给你捎来一些东西。", "Tôi mang hộ bạn một ít đồ tới."),
    (4, "辛苦"): ("师傅，您辛苦了。", "Bác tài, bác vất vả rồi."),
    (4, "麻烦"): ("麻烦你开车慢一点儿。", "Phiền bác lái xe chậm một chút."),
    (4, "慢"): ("请开车慢一点儿。", "Hãy lái xe chậm một chút."),
    (4, "展览"): ("我们去看文物展览。", "Chúng tôi đi xem triển lãm văn vật."),
    (4, "注意"): ("开车时要注意安全。", "Khi lái xe phải chú ý an toàn."),
    (4, "差不多"): ("我们差不多到了。", "Chúng ta gần tới rồi."),
    (4, "清楚"): ("老师讲得很清楚。", "Giáo viên giảng rất rõ."),
    (5, "苦"): ("中药有一点儿苦。", "Thuốc bắc hơi đắng."),
    (5, "甜"): ("糖葫芦甜甜的。", "Kẹo hồ lô ngọt ngọt."),
    (5, "摸"): ("中医给他摸脉。", "Bác sĩ đông y bắt mạch cho anh ấy."),
    (5, "治"): ("中医给他治病。", "Bác sĩ đông y chữa bệnh cho anh ấy."),
    (5, "细"): ("针灸用的针很细。", "Kim dùng để châm cứu rất nhỏ."),
    (5, "好听"): ("这支小提琴曲很好听。", "Khúc violin này rất hay."),
    (6, "利用"): ("他利用假期去打工。", "Anh ấy tận dụng kỳ nghỉ để đi làm thêm."),
    (6, "需要"): ("旅行社需要一个导游。", "Công ty du lịch cần một hướng dẫn viên."),
    (6, "经常"): ("他经常利用假期旅行。", "Anh ấy thường tận dụng kỳ nghỉ để du lịch."),
    (6, "收集"): ("导游收集了很多资料。", "Hướng dẫn viên đã thu thập nhiều tài liệu."),
    (6, "安排"): ("老板安排我帮助导游。", "Ông chủ sắp xếp tôi giúp hướng dẫn viên."),
    (6, "帮助"): ("同学们互相帮助。", "Các bạn học giúp đỡ lẫn nhau."),
    (6, "帮"): ("请你帮我安排一下。", "Bạn hãy giúp tôi sắp xếp một chút."),
    (6, "希望"): ("我希望去故乡旅行。", "Tôi hy vọng đi du lịch quê hương."),
    (6, "自由"): ("假期里时间很自由。", "Trong kỳ nghỉ, thời gian rất tự do."),
    (7, "放"): ("我把护照放在口袋里。", "Tôi để hộ chiếu trong túi áo."),
    (7, "交"): ("我把手提包交给你了。", "Tôi đã giao túi xách cho bạn."),
    (7, "丢三落四"): ("他总是丢三落四。", "Anh ấy lúc nào cũng hay quên."),
    (7, "丢"): ("我把护照丢了。", "Tôi làm mất hộ chiếu rồi."),
    (7, "落"): ("我把护照落在家里了。", "Tôi để quên hộ chiếu ở nhà rồi."),
    (7, "发现"): ("我发现护照在口袋里。", "Tôi phát hiện hộ chiếu ở trong túi áo."),
    (7, "承认"): ("他承认自己是球迷。", "Anh ấy thừa nhận mình là người hâm mộ bóng đá."),
    (7, "发狂"): ("球迷高兴得快发狂了。", "Người hâm mộ vui đến mức sắp phát cuồng."),
    (7, "像"): ("他看起来像生病了。", "Trông anh ấy như bị bệnh."),
    (7, "生病"): ("他昨天生病了。", "Hôm qua anh ấy bị bệnh."),
    (7, "精神"): ("他今天很精神。", "Hôm nay anh ấy rất tỉnh táo."),
    (7, "贴"): ("门口贴着通知。", "Ở cửa đang dán thông báo."),
    (7, "通知"): ("门口贴着一个通知。", "Ở cửa đang dán một thông báo."),
    (7, "暂停"): ("商店暂停营业。", "Cửa hàng tạm ngừng kinh doanh."),
    (7, "营业"): ("商店白天正常营业。", "Cửa hàng kinh doanh bình thường vào ban ngày."),
    (7, "辞职"): ("他最后决定辞职。", "Cuối cùng anh ấy quyết định nghỉ việc."),
    (7, "佩服"): ("我很佩服这个球迷。", "Tôi rất khâm phục người hâm mộ này."),
    (7, "棒"): ("他踢足球踢得真棒。", "Anh ấy đá bóng thật tuyệt."),
    (8, "洗"): ("这些照片洗好了。", "Những bức ảnh này đã tráng xong."),
    (8, "闭"): ("照片上他的眼睛闭着。", "Trong ảnh mắt anh ấy đang nhắm."),
    (8, "碰"): ("自行车碰到了汽车。", "Xe đạp va phải ô tô."),
    (8, "整"): ("我整整等了二十分钟。", "Tôi đã đợi tròn hai mươi phút."),
    (8, "摔跤"): ("他骑车时摔跤了。", "Anh ấy bị ngã khi đi xe đạp."),
    (8, "摔"): ("我的眼镜摔坏了。", "Kính của tôi bị rơi hỏng rồi."),
    (8, "掉"): ("眼镜掉在地上了。", "Kính đã rơi xuống đất."),
    (8, "保证"): ("我保证遵守交通规则。", "Tôi bảo đảm tuân thủ luật giao thông."),
    (8, "遵守"): ("大家都要遵守交通规则。", "Mọi người đều phải tuân thủ luật giao thông."),
    (8, "造成"): ("拥挤容易造成事故。", "Chen chúc dễ gây ra tai nạn."),
    (8, "拥挤"): ("上班时间交通很拥挤。", "Giờ đi làm giao thông rất đông đúc."),
    (8, "主要"): ("这是事故的主要原因。", "Đây là nguyên nhân chính của tai nạn."),
    (8, "引起"): ("自行车引起了事故。", "Xe đạp đã gây ra tai nạn."),
    (8, "赶快"): ("我们赶快去上班吧。", "Chúng ta mau đi làm thôi."),
    (8, "发展"): ("城市正在发展地铁。", "Thành phố đang phát triển tàu điện ngầm."),
    (9, "兴奋"): ("看到新书，我很兴奋。", "Nhìn thấy sách mới, tôi rất hào hứng."),
    (9, "下来"): ("我从书架上拿下来一本书。", "Tôi lấy một cuốn sách xuống từ giá."),
    (9, "抽"): ("他从书架上抽出一本小说。", "Anh ấy rút một cuốn tiểu thuyết từ giá sách."),
    (9, "挑"): ("我挑了几本历史书。", "Tôi chọn vài cuốn sách lịch sử."),
    (9, "选"): ("麦克选了一本中文小说。", "Mike chọn một cuốn tiểu thuyết tiếng Trung."),
    (9, "拍"): ("这部电影是根据小说拍的。", "Bộ phim này được quay dựa theo tiểu thuyết."),
    (9, "累"): ("走了很久，我很累。", "Đi rất lâu nên tôi rất mệt."),
    (9, "困"): ("吃完饭以后我很困。", "Ăn xong tôi rất buồn ngủ."),
    (9, "维修"): ("电梯正在维修。", "Thang máy đang được bảo trì."),
    (9, "修"): ("师傅正在修电梯。", "Bác thợ đang sửa thang máy."),
    (9, "提"): ("他手里提着一个纸箱。", "Anh ấy đang xách một thùng giấy."),
    (9, "想起来"): ("我忽然想起来钥匙没拔。", "Tôi bỗng nhớ ra chìa khóa chưa rút."),
    (9, "插"): ("钥匙还插在车上。", "Chìa khóa vẫn đang cắm trên xe."),
    (9, "拔"): ("我忘了把钥匙拔下来。", "Tôi quên rút chìa khóa ra."),
    (9, "哭笑不得"): ("看到钥匙，我哭笑不得。", "Nhìn thấy chìa khóa, tôi dở khóc dở cười."),
    (10, "穿"): ("她穿着一件红西服。", "Cô ấy đang mặc một bộ com-lê đỏ."),
    (10, "主持"): ("她正在主持婚礼。", "Cô ấy đang chủ trì hôn lễ."),
    (10, "讲话"): ("主持人拿着麦克风讲话。", "Người dẫn chương trình cầm micro nói chuyện."),
    (10, "喜"): ("墙上挂着红双喜字。", "Trên tường treo chữ song hỷ màu đỏ."),
    (10, "挂"): ("墙上挂着红灯笼。", "Trên tường treo đèn lồng đỏ."),
    (10, "摆"): ("桌上摆着很多水果。", "Trên bàn bày nhiều hoa quả."),
    (10, "帅"): ("新郎长得很帅。", "Chú rể trông rất đẹp trai."),
    (10, "热情"): ("客人都很热情。", "Các vị khách đều rất nhiệt tình."),
})

SPECIAL_EXAMPLES.update({
    (2, "国家"): ("我爱自己的国家。", "Tôi yêu đất nước của mình."),
    (2, "夜"): ("夜里非常安静。", "Ban đêm rất yên tĩnh."),
    (2, "季节"): ("我最喜欢春天这个季节。", "Tôi thích nhất mùa xuân."),
    (2, "春天"): ("春天来了，天气暖了。", "Mùa xuân đến rồi, thời tiết ấm lên rồi."),
    (2, "夏天"): ("夏天常常下雨。", "Mùa hè thường hay mưa."),
    (2, "秋天"): ("秋天的天气很凉快。", "Thời tiết mùa thu rất mát mẻ."),
    (2, "热"): ("北京的夏天很热。", "Mùa hè ở Bắc Kinh rất nóng."),
    (2, "风"): ("今天的风很大。", "Hôm nay gió rất lớn."),
    (2, "雪"): ("昨晚下了一场雪。", "Tối qua có một trận tuyết."),
    (2, "听写"): ("明天有汉语听写。", "Ngày mai có bài chính tả tiếng Trung."),
    (2, "周末"): ("周末我们去爬山。", "Cuối tuần chúng tôi đi leo núi."),
    (2, "历史"): ("我喜欢学习中国历史。", "Tôi thích học lịch sử Trung Quốc."),
    (2, "画册"): ("这本画册很漂亮。", "Cuốn sách tranh này rất đẹp."),
    (2, "研究"): ("他在研究中国历史。", "Anh ấy đang nghiên cứu lịch sử Trung Quốc."),
    (2, "改革"): ("改革以后变化很大。", "Sau cải cách có thay đổi rất lớn."),
    (2, "出去"): ("周末我们一起出去玩。", "Cuối tuần chúng tôi cùng ra ngoài chơi."),
    (2, "一切"): ("一切都准备好了。", "Mọi thứ đều đã chuẩn bị xong."),

    (3, "家乡"): ("我的家乡在南方。", "Quê tôi ở miền Nam."),
    (3, "区"): ("这个区冬天很冷。", "Khu vực này mùa đông rất lạnh."),
    (3, "人家"): ("别拿人家的东西。", "Đừng lấy đồ của người khác."),
    (3, "树叶"): ("秋天树叶变红了。", "Mùa thu lá cây chuyển đỏ."),
    (3, "树"): ("院子里有两棵树。", "Trong sân có hai cây."),
    (3, "叶"): ("地上有很多落叶。", "Trên đất có rất nhiều lá rụng."),
    (3, "红叶"): ("香山的红叶很美。", "Lá đỏ ở Hương Sơn rất đẹp."),
    (3, "电池"): ("这个电池没有电了。", "Viên pin này hết điện rồi."),
    (3, "好事"): ("帮助别人是好事。", "Giúp đỡ người khác là việc tốt."),
    (3, "坏事"): ("他从来不做坏事。", "Anh ấy chưa bao giờ làm việc xấu."),
    (3, "母亲"): ("他的母亲是老师。", "Mẹ anh ấy là giáo viên."),
    (3, "父亲"): ("我父亲明天回来。", "Ngày mai bố tôi về."),
    (3, "未婚夫"): ("她的未婚夫是医生。", "Chồng sắp cưới của cô ấy là bác sĩ."),
    (3, "未婚妻"): ("这是他的未婚妻。", "Đây là vợ sắp cưới của anh ấy."),
    (3, "将来"): ("将来我想当老师。", "Sau này tôi muốn làm giáo viên."),
    (3, "旅游"): ("暑假我们去北京旅游。", "Nghỉ hè chúng tôi đi Bắc Kinh du lịch."),
    (3, "避暑"): ("夏天我们去山里避暑。", "Mùa hè chúng tôi lên núi tránh nóng."),
    (3, "经营"): ("他经营一家小饭馆。", "Anh ấy kinh doanh một quán ăn nhỏ."),
    (3, "捡"): ("他从地上捡起钥匙。", "Anh ấy nhặt chìa khóa từ dưới đất lên."),
    (3, "尤其"): ("我尤其喜欢秋天。", "Tôi đặc biệt thích mùa thu."),
    (3, "哎呀"): ("哎呀，我忘带钥匙了。", "Ôi, tôi quên mang chìa khóa rồi."),

    (4, "教学"): ("他负责汉语教学。", "Anh ấy phụ trách giảng dạy tiếng Trung."),
    (4, "门口"): ("我在学校门口等你。", "Tôi đợi bạn ở cổng trường."),
    (4, "爱人"): ("王老师的爱人来了。", "Vợ hoặc chồng của thầy Vương đã đến."),
    (4, "展览馆"): ("展览馆里有很多文物。", "Trong nhà triển lãm có nhiều cổ vật."),
    (4, "照相机"): ("我的照相机坏了。", "Máy ảnh của tôi hỏng rồi."),
    (4, "座位"): ("这个座位有人吗？", "Chỗ ngồi này có người chưa?"),
    (4, "文物"): ("博物馆里有很多文物。", "Trong bảo tàng có nhiều cổ vật."),
    (4, "要求"): ("老师提出了新要求。", "Giáo viên đưa ra yêu cầu mới."),
    (4, "师傅"): ("师傅，请停车。", "Bác tài, xin hãy dừng xe."),
    (4, "大使馆"): ("大使馆离这儿不远。", "Đại sứ quán không xa đây."),
    (4, "大使"): ("那位大使会说汉语。", "Vị đại sứ ấy biết nói tiếng Trung."),
    (4, "开会"): ("老师们正在开会。", "Các giáo viên đang họp."),
    (4, "研讨"): ("我们研讨教学方法。", "Chúng tôi thảo luận phương pháp giảng dạy."),
    (4, "办事"): ("他去大使馆办事。", "Anh ấy đến đại sứ quán giải quyết công việc."),
    (4, "照相"): ("我们在长城照相。", "Chúng tôi chụp ảnh ở Vạn Lý Trường Thành."),

    (5, "经历"): ("这次经历让我难忘。", "Trải nghiệm lần này khiến tôi khó quên."),
    (5, "中成药"): ("医生给我开了中成药。", "Bác sĩ kê thuốc Đông y bào chế sẵn cho tôi."),
    (5, "脉"): ("医生正在给他把脉。", "Bác sĩ đang bắt mạch cho anh ấy."),
    (5, "药方"): ("医生开了一个药方。", "Bác sĩ kê một đơn thuốc."),
    (5, "针灸"): ("针灸是中医治疗方法。", "Châm cứu là một phương pháp điều trị của Đông y."),
    (5, "方法"): ("这个方法很有效。", "Phương pháp này rất hiệu quả."),
    (5, "烤鸭"): ("北京烤鸭很有名。", "Vịt quay Bắc Kinh rất nổi tiếng."),
    (5, "中餐"): ("我喜欢吃中餐。", "Tôi thích ăn món Trung Quốc."),
    (5, "白薯"): ("冬天吃烤白薯很香。", "Mùa đông ăn khoai lang nướng rất thơm."),
    (5, "糖葫芦"): ("孩子喜欢吃糖葫芦。", "Trẻ em thích ăn kẹo hồ lô."),
    (5, "糖"): ("咖啡里不要放糖。", "Đừng cho đường vào cà phê."),
    (5, "钢琴"): ("她每天练习钢琴。", "Cô ấy luyện piano mỗi ngày."),
    (5, "小提琴"): ("他会拉小提琴。", "Anh ấy biết kéo violin."),
    (5, "协奏曲"): ("我听过这首协奏曲。", "Tôi đã nghe bản concerto này."),
    (5, "按摩"): ("医生给他按摩。", "Bác sĩ xoa bóp cho anh ấy."),
    (5, "扎针"): ("护士正在给病人扎针。", "Y tá đang châm kim cho bệnh nhân."),
    (5, "烤"): ("我们在院子里烤白薯。", "Chúng tôi nướng khoai lang trong sân."),
    (5, "演奏"): ("她正在演奏小提琴。", "Cô ấy đang biểu diễn violin."),
    (5, "曾经"): ("我曾经去过北京。", "Tôi đã từng đến Bắc Kinh."),
    (5, "好"): ("这件衣服好漂亮。", "Bộ quần áo này đẹp quá."),
    (5, "亲耳"): ("这件事我亲耳听到。", "Chuyện này tôi tận tai nghe thấy."),

    (6, "前天"): ("前天我们去了长城。", "Hôm kia chúng tôi đã đến Vạn Lý Trường Thành."),
    (6, "后天"): ("后天我们一起出发。", "Ngày kia chúng ta cùng xuất phát."),
    (6, "导游"): ("导游带我们参观故宫。", "Hướng dẫn viên dẫn chúng tôi tham quan Cố Cung."),
    (6, "研究生"): ("他是汉语专业研究生。", "Anh ấy là học viên cao học chuyên ngành tiếng Trung."),
    (6, "假期"): ("假期我想去旅行。", "Kỳ nghỉ tôi muốn đi du lịch."),
    (6, "旅行社"): ("旅行社安排了行程。", "Công ty du lịch đã sắp xếp hành trình."),
    (6, "组织"): ("学校组织了一次旅行。", "Nhà trường tổ chức một chuyến đi."),
    (6, "老板"): ("老板同意我请假。", "Ông chủ đồng ý cho tôi nghỉ phép."),
    (6, "铁路"): ("这条铁路通往上海。", "Tuyến đường sắt này đi đến Thượng Hải."),
    (6, "风光"): ("沿途风光非常美。", "Phong cảnh dọc đường rất đẹp."),
    (6, "故乡"): ("他很想念自己的故乡。", "Anh ấy rất nhớ quê hương mình."),
    (6, "活动"): ("下午有文化活动。", "Buổi chiều có hoạt động văn hóa."),
    (6, "鼻子"): ("他的鼻子很高。", "Mũi anh ấy cao."),
    (6, "头发"): ("她的头发又黑又长。", "Tóc cô ấy vừa đen vừa dài."),
    (6, "眼睛"): ("她的眼睛很漂亮。", "Đôi mắt cô ấy rất đẹp."),
    (6, "声调"): ("汉语有四个声调。", "Tiếng Trung có bốn thanh điệu."),
    (6, "打工"): ("他假期在饭馆打工。", "Kỳ nghỉ anh ấy làm thêm tại quán ăn."),
    (6, "商量"): ("我想跟你商量一件事。", "Tôi muốn bàn với bạn một việc."),

    (7, "大衣"): ("天冷了，穿上大衣吧。", "Trời lạnh rồi, mặc áo khoác vào nhé."),
    (7, "口袋"): ("钥匙在大衣口袋里。", "Chìa khóa ở trong túi áo khoác."),
    (7, "球迷"): ("他是一个足球迷。", "Anh ấy là một người hâm mộ bóng đá."),
    (7, "程度"): ("他的汉语到了什么程度？", "Tiếng Trung của anh ấy đã đến trình độ nào?"),
    (7, "锦标赛"): ("他参加了世界锦标赛。", "Anh ấy tham gia giải vô địch thế giới."),
    (7, "期间"): ("比赛期间他很忙。", "Trong thời gian thi đấu anh ấy rất bận."),
    (7, "白天"): ("他白天上课，晚上打工。", "Ban ngày anh ấy học, buổi tối làm thêm."),
    (7, "世界杯"): ("很多球迷在看世界杯。", "Nhiều người hâm mộ đang xem World Cup."),
    (7, "最后"): ("他最后还是赢了。", "Cuối cùng anh ấy vẫn thắng."),
    (7, "正常"): ("他的身体已经正常了。", "Sức khỏe của anh ấy đã bình thường lại."),
    (7, "亲眼"): ("我亲眼看见了比赛。", "Tôi đã tận mắt xem trận đấu."),

    (8, "油画"): ("墙上挂着一幅油画。", "Trên tường treo một bức tranh sơn dầu."),
    (8, "事故"): ("路上发生了交通事故。", "Trên đường đã xảy ra tai nạn giao thông."),
    (8, "地上"): ("眼镜掉在地上了。", "Kính rơi xuống đất rồi."),
    (8, "规则"): ("大家都要遵守规则。", "Mọi người đều phải tuân thủ quy tắc."),
    (8, "原因"): ("你知道迟到的原因吗？", "Bạn có biết nguyên nhân đến muộn không?"),
    (8, "放大"): ("请把这张照片放大。", "Hãy phóng to bức ảnh này."),
    (8, "上班"): ("他每天八点上班。", "Anh ấy đi làm lúc tám giờ mỗi ngày."),
    (8, "下班"): ("我六点下班回家。", "Tôi tan làm lúc sáu giờ rồi về nhà."),

    (9, "图书城"): ("这座图书城很大。", "Nhà sách tổng hợp này rất lớn."),
    (9, "图书"): ("图书馆里有很多图书。", "Trong thư viện có rất nhiều sách."),
    (9, "样"): ("这两件衣服一个样。", "Hai bộ quần áo này giống hệt nhau."),
    (9, "音像"): ("这里卖音像制品。", "Ở đây bán sản phẩm nghe nhìn."),
    (9, "学期"): ("这个学期我很忙。", "Học kỳ này tôi rất bận."),
    (9, "纸箱"): ("书都装在纸箱里。", "Sách đều được đựng trong thùng giấy."),
    (9, "纸"): ("请给我一张纸。", "Xin đưa tôi một tờ giấy."),
    (9, "饭馆"): ("学校旁边有一家饭馆。", "Bên cạnh trường có một quán ăn."),
    (9, "电梯"): ("我们坐电梯上楼。", "Chúng tôi đi thang máy lên tầng."),
    (9, "楼梯"): ("他从楼梯走下来。", "Anh ấy đi xuống bằng cầu thang."),
    (9, "钥匙"): ("我忘了带钥匙。", "Tôi quên mang chìa khóa."),
    (9, "忽然"): ("天空忽然下起雨来。", "Trời bỗng đổ mưa."),
    (9, "这里"): ("这里有很多图书。", "Ở đây có rất nhiều sách."),
    (9, "那里"): ("那里有一家饭馆。", "Ở đó có một quán ăn."),

    (10, "会议厅"): ("大家已经到了会议厅。", "Mọi người đã đến phòng hội nghị."),
    (10, "厅"): ("大厅里坐满了客人。", "Đại sảnh đã kín khách ngồi."),
    (10, "中心"): ("市中心有很多商店。", "Trung tâm thành phố có nhiều cửa hàng."),
    (10, "服务员"): ("服务员正在摆桌子。", "Nhân viên phục vụ đang sắp bàn."),
    (10, "裙子"): ("她穿着一条红裙子。", "Cô ấy đang mặc một chiếc váy đỏ."),
    (10, "小伙子"): ("那个小伙子很热情。", "Chàng trai ấy rất nhiệt tình."),
    (10, "墙"): ("墙上贴着一张照片。", "Trên tường dán một bức ảnh."),
    (10, "婚礼"): ("我们参加了他们的婚礼。", "Chúng tôi dự đám cưới của họ."),
    (10, "灯笼"): ("门口挂着红灯笼。", "Ở cửa treo đèn lồng đỏ."),
    (10, "新娘"): ("新娘穿着红棉袄。", "Cô dâu đang mặc áo bông đỏ."),
    (10, "棉袄"): ("她穿着一件红棉袄。", "Cô ấy đang mặc một chiếc áo bông đỏ."),
    (10, "新郎"): ("新郎系着红领带。", "Chú rể đang thắt cà vạt đỏ."),
    (10, "领带"): ("他今天系了一条领带。", "Hôm nay anh ấy thắt một chiếc cà vạt."),
    (10, "客人"): ("客人们都到齐了。", "Các vị khách đã đến đông đủ."),
    (10, "气氛"): ("婚礼的气氛很热闹。", "Không khí đám cưới rất náo nhiệt."),
    (10, "热闹"): ("婚礼现场很热闹。", "Quang cảnh đám cưới rất náo nhiệt."),
})


def strip_tones(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn" and char.isalpha()).lower()


def pinyin_word(text: str, override: str | None = None) -> str:
    if override:
        return override.replace(" ", "")
    return "".join(lazy_pinyin(text, style=Style.TONE, neutral_tone_with_five=False))


def pinyin_sentence(text: str, lesson_words: dict[str, str]) -> str:
    common = {
        "我们", "他们", "你们", "这里", "那里", "这个", "这些", "今天", "昨天", "明天", "一起",
        "课文", "介绍", "老师", "同学", "中国", "北京", "上海", "汉语", "英语", "已经", "终于",
        "什么", "一个", "两个", "小时", "分钟", "学期", "电视台", "长城", "宿舍", "小说",
        "光盘", "图书馆", "书店", "老板", "朋友", "喜欢", "知道", "看起来", "差点儿",
        "着急", "地方", "地铁",
    }
    lexicon = set(lesson_words) | common
    tokens = []
    index = 0
    while index < len(text):
        char = text[index]
        if re.match(r"[\u4e00-\u9fff]", char):
            matches = [term for term in lexicon if "…" not in term and text.startswith(term, index)]
            token = max(matches, key=len) if matches else char
            tokens.append(token)
            index += len(token)
        else:
            tokens.append(char)
            index += 1

    rendered = []
    for token_index, token in enumerate(tokens):
        previous_token = tokens[token_index - 1] if token_index > 0 else ""
        next_token = tokens[token_index + 1] if token_index + 1 < len(tokens) else ""
        if token == "着急":
            rendered.append("zháojí")
            continue
        if token == "地方":
            rendered.append("dìfang")
            continue
        if token == "地铁":
            rendered.append("dìtiě")
            continue
        if token == "着":
            two_tokens_back = tokens[token_index - 2] if token_index > 1 else ""
            is_result_complement = previous_token.endswith(("找", "睡")) or (
                previous_token == "不" and two_tokens_back.endswith(("找", "睡"))
            )
            rendered.append("zháo" if is_result_complement else "zhe")
            continue
        if token == "得":
            rendered.append("dé" if next_token in {"了", "过"} else "de")
            continue
        if token == "还" and next_token in {"住", "没", "要", "有", "是", "在", "会", "可以"}:
            rendered.append("hái")
            continue
        if token in lesson_words:
            rendered.append(lesson_words[token])
            continue
        if re.fullmatch(r"[\u4e00-\u9fff]+", token):
            parts = lazy_pinyin(token, style=Style.TONE, neutral_tone_with_five=False)
            for char_index, char in enumerate(token):
                if char in {"得", "地"}:
                    parts[char_index] = "de"
                elif char == "了":
                    parts[char_index] = "le"
                elif char == "过" and char_index > 0:
                    parts[char_index] = "guo"
            rendered.append("".join(parts))
        else:
            rendered.append(token)
    result = " ".join(rendered)
    for source, target in {"，": ",", "。": ".", "？": "?", "！": "!", "：": ":", "；": ";"}.items():
        result = result.replace(" " + source, target).replace(source, target)
    result = re.sub(r"\s+([,.?!:;])", r"\1", result)
    return result[:1].upper() + result[1:] if result else result


def short_meaning(value: str) -> str:
    return re.split(r"[;,]", value)[0].strip()


def inferred_example(number: int, spec: dict) -> tuple[str, str]:
    special = SPECIAL_EXAMPLES.get((number, spec["zh"]))
    if special:
        return special
    word = spec["zh"]
    meaning = short_meaning(spec["vi"])
    word_type = spec["word_type"]
    if "名" in word_type:
        return f"课文介绍了{word}。", f"Bài khóa giới thiệu {meaning}."
    if "动" in word_type:
        return f"我们一起{word}吧。", f"Chúng ta cùng {meaning} nhé."
    if "形" in word_type:
        return f"他说这里很{word}。", f"Anh ấy nói ở đây rất {meaning}."
    if "副" in word_type:
        return f"课文里用了“{word}”。", f"Trong bài khóa có dùng từ “{word}” ({meaning})."
    return f"课文里有“{word}”这个词。", f"Trong bài khóa có từ “{word}” ({meaning})."


def section_bounds(lines: list[str], number: int) -> tuple[int, int, int]:
    vocab = next((i + 1 for i, line in enumerate(lines) if "生词" in line), 1)
    grammar = GRAMMAR_START_LINES[number]
    exercise = EXERCISE_LINES[number]
    return vocab, grammar, exercise


def source_line_for_word(lines: list[str], number: int, word: str, pinyin: str) -> tuple[int, str, str | None]:
    override = SOURCE_LINE_OVERRIDES.get((number, word))
    if override:
        return override, "medium", "Chữ Hán bị mất/lệch trong OCR; source_line trỏ tới hàng từ hoặc pinyin gần nhất."
    vocab, grammar, exercise = section_bounds(lines, number)
    for line_number in range(vocab, grammar):
        if word in lines[line_number - 1]:
            return line_number, "high", None
    for line_number in range(1, exercise):
        if word in lines[line_number - 1]:
            return line_number, "high", None

    target = strip_tones(pinyin)
    best = (0.0, vocab)
    for line_number in range(vocab, grammar):
        ascii_tokens = re.findall(r"[A-Za-z]+", lines[line_number - 1])
        for token in ascii_tokens:
            score = difflib.SequenceMatcher(None, target, token.lower()).ratio()
            if score > best[0]:
                best = (score, line_number)
    if best[0] >= 0.58:
        return best[1], "medium", "Chữ Hán bị mất/lệch trong OCR; source_line trỏ tới hàng pinyin gần nhất."
    return vocab, "low", "Không xác định được hàng riêng do OCR; source_line trỏ tới đầu mục 生词."


def find_line(lines: list[str], start: int, end: int, texts: list[str]) -> int:
    candidates = []
    for text in texts:
        candidates.extend(piece for piece in re.findall(r"[\u4e00-\u9fff]{2,}", text) if len(piece) >= 2)
    for candidate in sorted(set(candidates), key=len, reverse=True):
        for line_number in range(start, end):
            if candidate in lines[line_number - 1]:
                return line_number
    return start


def related_word_ids(index: int, specs: list[dict], word_ids: dict[str, str], grammar_ids: list[str], grammar_texts: list[str]) -> list[str]:
    word = specs[index]["zh"]
    related = []
    for grammar_id, grammar_text in zip(grammar_ids, grammar_texts):
        if word in grammar_text and grammar_id not in related:
            related.append(grammar_id)
    ranked = sorted(
        (other_index for other_index in range(len(specs)) if other_index != index),
        key=lambda other_index: (
            0 if any(tag in type_tags(specs[index]["word_type"]) for tag in type_tags(specs[other_index]["word_type"])[1:]) else 1,
            abs(other_index - index),
        ),
    )
    for other_index in ranked:
        candidate = word_ids[specs[other_index]["zh"]]
        if candidate not in related:
            related.append(candidate)
        if len(related) == 3:
            break
    return related[:4]


def build_lesson(number: int, generated_at: str) -> dict:
    lesson = LESSONS[number]
    source_rel = f"data/_extracted/bai/bai{number:02d}.txt"
    lines = (ROOT / source_rel).read_text(encoding="utf-8", errors="replace").splitlines()
    vocab_start, grammar_start, exercise_line = section_bounds(lines, number)
    specs = lesson["words"]
    word_ids = {spec["zh"]: f"bai{number:02d}_w{index:03d}" for index, spec in enumerate(specs, 1)}
    word_pinyin = {spec["zh"]: pinyin_word(spec["zh"], spec["pinyin"]) for spec in specs}
    grammar_ids = [f"bai{number:02d}_g{index:03d}" for index in range(1, len(lesson["grammar"]) + 1)]
    grammar_texts = [spec["title_zh"] + spec["structure"] + "".join(zh for zh, _ in spec["examples"]) for spec in lesson["grammar"]]
    entries = []

    for index, spec in enumerate(specs):
        source_line, confidence, note = source_line_for_word(lines, number, spec["zh"], word_pinyin[spec["zh"]])
        doc_example = DOCUMENT_EXAMPLES.get((number, spec["zh"]))
        if doc_example:
            example_zh, example_vi = doc_example
            example_source = "document"
        else:
            example_zh, example_vi = inferred_example(number, spec)
            example_source = "ai_inferred"
        entries.append({
            "id": f"bai{number:02d}_w{index + 1:03d}", "bai": number, "type": "word",
            "word_zh": spec["zh"], "pinyin": word_pinyin[spec["zh"]], "word_type": spec["word_type"],
            "meaning_vi": spec["vi"], "meaning_en": spec["en"],
            "example_zh": example_zh, "example_pinyin": pinyin_sentence(example_zh, word_pinyin),
            "example_vi": example_vi, "example_source": example_source, "grammar_note": None,
            "related_words": related_word_ids(index, specs, word_ids, grammar_ids, grammar_texts),
            "tags": type_tags(spec["word_type"]), "source_line": source_line,
            "confidence": confidence, "note": note,
        })

    for index, spec in enumerate(lesson["grammar"], 1):
        grammar_id = f"bai{number:02d}_g{index:03d}"
        texts = [spec["title_zh"], spec["structure"], *(zh for zh, _ in spec["examples"])]
        source_line = find_line(lines, grammar_start, exercise_line, texts)
        haystack = "".join(texts)
        related = [word_ids[word] for word in word_ids if word in haystack]
        if len(related) < 2:
            related.extend(other for other in grammar_ids if other != grammar_id and other not in related)
        if len(related) < 2:
            related.extend(list(word_ids.values())[: 2 - len(related)])
        entries.append({
            "id": grammar_id, "bai": number, "type": "grammar",
            "grammar_title_zh": spec["title_zh"], "grammar_title_vi": spec["title_vi"],
            "structure": spec["structure"], "explanation_vi": spec["explanation_vi"], "explanation_zh": spec["explanation_zh"],
            "examples": [{"zh": zh, "pinyin": pinyin_sentence(zh, word_pinyin), "vi": vi, "source": "document"} for zh, vi in spec["examples"]],
            "related_words": related[:4], "tags": ["ngu_phap"], "source_line": source_line,
            "confidence": "high", "note": None,
        })

    phrase_ids = [f"bai{number:02d}_p{index:03d}" for index in range(1, len(lesson["phrases"]) + 1)]
    for index, spec in enumerate(lesson["phrases"], 1):
        phrase_id = f"bai{number:02d}_p{index:03d}"
        source_line = find_line(lines, 1, exercise_line, [spec["zh"]])
        related = [word_ids[word] for word in word_ids if word in spec["zh"]]
        ranked_words = sorted(word_ids, key=lambda word: abs(source_line_for_word(lines, number, word, word_pinyin[word])[0] - source_line))
        related.extend(word_ids[word] for word in ranked_words if word_ids[word] not in related)
        if len(related) < 2:
            related.extend(other for other in phrase_ids if other != phrase_id and other not in related)
        entries.append({
            "id": phrase_id, "bai": number, "type": "phrase", "phrase_zh": spec["zh"],
            "pinyin": spec["pinyin"] or pinyin_sentence(spec["zh"], word_pinyin).rstrip("。！？.!?"),
            "meaning_vi": spec["vi"], "meaning_en": spec["en"], "usage_note": spec["usage"],
            "related_words": related[:3], "tags": ["mau_cau", "khau_ngu"], "source_line": source_line,
            "confidence": "high", "note": None,
        })

    words = [entry for entry in entries if entry["type"] == "word"]
    title_source = "ai_inferred" if number in {6, 9} else "document"
    return {
        "metadata": {
            "bai": number, "title_zh": lesson["title_zh"], "title_vi": lesson["title_vi"],
            "title_source": title_source, "source_file": source_rel, "total_entries": len(entries),
            "word_count": len(words), "grammar_count": sum(entry["type"] == "grammar" for entry in entries),
            "phrase_count": sum(entry["type"] == "phrase" for entry in entries),
            "example_stats": {
                "from_document": sum(entry["example_source"] == "document" for entry in words),
                "ai_inferred": sum(entry["example_source"] == "ai_inferred" for entry in words),
                "missing": sum(not entry["example_zh"] for entry in words),
            },
            "generated_at": generated_at, "version": "2.0",
        },
        "entries": entries,
    }


def validate(payload: dict, source_line_count: int, exercise_line: int) -> None:
    entries = payload["entries"]
    ids = [entry["id"] for entry in entries]
    id_set = set(ids)
    assert len(ids) == len(id_set)
    assert payload["metadata"]["total_entries"] == len(entries)
    assert payload["metadata"]["example_stats"]["missing"] == 0
    assert all("page" not in entry and 1 <= entry["source_line"] < exercise_line <= source_line_count for entry in entries)
    for entry in entries:
        assert 2 <= len(entry["related_words"]) <= 4, entry["id"]
        assert all(related in id_set for related in entry["related_words"]), entry["id"]
        assert not re.search(r"[\uac00-\ud7af]", json.dumps(entry, ensure_ascii=False)), entry["id"]
        if entry["type"] == "word":
            assert entry["example_zh"] and entry["example_pinyin"] and entry["example_vi"], entry["id"]
            assert entry["example_source"] in {"document", "ai_inferred"}
        if entry["confidence"] == "low":
            assert entry["note"]


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    temp_dir = ROOT / "data" / "_v2_tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for number in range(2, 11):
        payload = build_lesson(number, generated_at)
        source_lines = (ROOT / f"data/_extracted/bai/bai{number:02d}.txt").read_text(encoding="utf-8", errors="replace").splitlines()
        validate(payload, len(source_lines), EXERCISE_LINES[number])
        path = temp_dir / f"glossary_bai{number:02d}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        reparsed = json.loads(path.read_text(encoding="utf-8"))
        validate(reparsed, len(source_lines), EXERCISE_LINES[number])
        summaries.append(reparsed["metadata"])
    print(json.dumps(summaries, ensure_ascii=False))


if __name__ == "__main__":
    main()
