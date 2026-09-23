const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

content = content.replace(
  /<EmptyState icon="." title="S. tay dang s.ch" text="C.c c.u chua d.t s. t. xu.t hi.n t.i d.y." \/>/g,
  '<EmptyState mascot="penguin" title="Sổ tay câu sai trống" text="Chưa có câu sai nào, giỏi lắm!" />'
);

content = content.replace(
  /<EmptyState icon="." title="Chua c. t. n.o" text=".nh d.u t. v.ng d. .n t.p nhanh." \/>/g,
  '<EmptyState mascot="panda" title="Chưa có từ nào" text="Chưa có từ nào được đánh dấu." />'
);

content = content.replace(
  /<EmptyState icon="." title="Chua c. ghi ch." text="Ghi ch. c.a b.n s. xu.t hi.n . d.y." \/>/g,
  '<EmptyState mascot="penguin" title="Chưa có ghi chú" text="Chưa có ghi chú nào." />'
);

content = content.replace(
  /<EmptyState icon="." title="Ho.n th.nh!" text="Kh.ng c.n t. n.o c.n .n t.p h.m nay." \/>/g,
  '<EmptyState mascot="panda" title="Hoàn thành!" text="Hôm nay không có từ nào cần ôn!" />'
);

// QuizScreen empty state
content = content.replace(
  /<EmptyState icon="." title="Ch.n m.t b.i d. luy.n" text="M.i b.i c. 30 c.u thu.c 12 d.ng." \/>/g,
  '<EmptyState mascot="panda" title="Chưa chọn bài" text="Vui lòng chọn bài từ Lộ trình để bắt đầu luyện tập." />'
);

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
