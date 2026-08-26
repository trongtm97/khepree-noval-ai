import type { HelpArticle } from '../types';

export const translationArticles: HelpArticle[] = [
  {
    id: 'notebook',
    categoryId: 'notebook',
    title: 'Notebook dùng để làm gì?',
    description: 'NotebookLM bổ sung ngữ cảnh cho Gemini.',
    keywords: [
      'notebook',
      'notebooklm',
      'bộ nhớ',
      'ngữ cảnh',
      'drive',
      'thiết lập',
      'setup',
      'ban đầu',
      'provision',
      'resume',
    ],
    order: 1,
    relatedIds: ['google-drive', 'novel-memory', 'book-profile', 'troubleshooting-notebook'],
    blocks: [
      { type: 'heading', level: 1, text: 'Notebook dùng để làm gì?' },
      {
        type: 'paragraph',
        text: 'NotebookLM (Gemini Notebook) là bộ nhớ dài hạn giúp Gemini hiểu truyện. NovelTrans lưu dữ liệu chính trên máy (SQLite). Thuật ngữ, nhân vật, quan hệ và trạng thái cốt truyện được tổng hợp thành file kiến thức rồi đồng bộ sang Notebook. Khi dịch, Gemini dùng Notebook + Translation Pack (chỉ chương hiện tại + Hot Memory) — không cần gửi lại toàn bộ lịch sử mỗi lần.',
      },
      {
        type: 'list',
        items: [
          '00_BOOK_PROFILE.md — hồ sơ truyện (metadata)',
          '01_TRANSLATION_RULES.md — quy tắc dịch + protocol',
          '02–04 — thuật ngữ dự án, nhân vật, quan hệ',
          '05_STORY_STATE.md — trạng thái cốt truyện hiện tại',
          '06_WORLD_KNOWLEDGE.md — thế giới truyện',
          '07_RECENT_CONTEXT.md — bối cảnh gần đây (cửa sổ rolling)',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'SQLite mới là dữ liệu chính',
        body: 'Nếu Notebook lỗi hoặc bị xóa, dữ liệu truyện trong NovelTrans không mất. Notebook không tự ghi đè database.',
      },
      { type: 'heading', level: 2, text: 'Luồng dịch' },
      {
        type: 'list',
        ordered: true,
        items: [
          'Chương cần dịch',
          'NovelTrans lấy Hot Memory / overrides',
          'Gemini mở Notebook của truyện',
          'Notebook cung cấp bộ nhớ dài hạn',
          'NovelTrans gửi Translation Pack (source + hot)',
          'Gemini dịch → QA → cập nhật SQLite',
          'Đồng bộ lại Notebook theo lịch / sự kiện quan trọng',
        ],
      },
      { type: 'heading', level: 2, text: 'Setup chuẩn (ban đầu)' },
      {
        type: 'list',
        ordered: true,
        items: [
          'Tài khoản Google worker đã đăng nhập.',
          'Dự án → Bộ nhớ AI → Xây bộ nhớ ban đầu.',
          'Thiết lập Notebook (Provision) đến khi Sẵn sàng.',
          'Đồng bộ ngay nếu kiến thức vừa đổi.',
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Assisted setup',
        body: 'Khi automation không khớp UI (Google đổi giao diện), app chuyển sang chế độ assisted: bạn làm thủ công trên browser, rồi Resume. Không cần bypass CAPTCHA/2FA.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Thông tin',
        body: 'Notebook gắn với từng cặp dự án + tài khoản Google. Cập nhật Book Profile sau khi sửa metadata dự án.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Book Profile', to: '/help/book-profile' },
          { label: 'Dịch truyện', to: '/translation' },
        ],
      },
    ],
  },
  {
    id: 'start-translate',
    categoryId: 'translation',
    title: 'Bắt đầu dịch tự động',
    description: 'Tạo tiến trình dịch từ trang Dịch truyện.',
    keywords: ['dịch', 'bắt đầu', 'tự động', 'batch', 'chương'],
    order: 1,
    relatedIds: ['workflow-steps', 'jobs-monitor', 'notebook'],
    blocks: [
      { type: 'heading', level: 1, text: 'Dịch truyện' },
      {
        type: 'paragraph',
        text: 'Đi tới Dịch truyện, chọn dự án và chương. Nút Tự động dịch trước hết chạy chuẩn bị Bộ nhớ AI (bootstrap/rebuild/Drive sync, provision Notebook nếu có thể), rồi mới tạo tiến trình dịch. Nếu Notebook chưa sẵn sàng, app tiếp tục với fat-pack và cảnh báo.',
      },
      {
        type: 'paragraph',
        text: 'Dịch cả truyện / khoảng chương / đã chọn: xếp hàng mỗi chương một tiến trình. Sau mỗi chương hoàn tất, bộ nhớ truyện (nhân vật, quan hệ, cốt truyện, thuật ngữ) cập nhật trong SQLite ngay — chương sau dùng fat-pack nếu Notebook đang stale. NotebookLM/Drive đồng bộ theo chu kỳ (mặc định mỗi ~10 chương), không cần bấm Notebook từng chương.',
      },
      {
        type: 'paragraph',
        text: 'Khi bấm dịch, NovelTrans tự heal: kiểm tra tài khoản Google, mở Gemini nếu cần đăng nhập, chuẩn bị Notebook/Drive. Chỉ khi không tự xong mới hiện nút Kiểm tra tài khoản Google / Mở NotebookLM.',
      },
      {
        type: 'paragraph',
        text: 'Chọn nhiều chương: tick checkbox (Shift+click để chọn dải). Thanh công cụ hiện Dịch đã chọn / Xóa bản dịch đã chọn / Dịch lại đã chọn. Click tên chương vẫn mở editor; không tick thì Xóa/Dịch lại chỉ áp dụng chương đang mở.',
      },
      {
        type: 'paragraph',
        text: 'Xóa bản dịch chương / Dịch lại: xóa bản dịch AI của chương hiện tại, giữ đoạn human_locked, rồi (với Dịch lại) chuẩn bị Notebook và enqueue lại.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Dịch truyện', to: '/translation' },
          { label: 'Tiến trình', to: '/jobs' },
        ],
      },
    ],
  },
  {
    id: 'workflow-steps',
    categoryId: 'translation',
    title: 'Giải thích các bước tiến trình',
    description: 'Ý nghĩa từng bước trong luồng dịch.',
    keywords: ['workflow', 'bước', 'chuẩn bị', 'gemini', 'kiểm tra', 'sửa'],
    order: 2,
    relatedIds: ['start-translate', 'auto-qa', 'jobs-monitor'],
    blocks: [
      { type: 'heading', level: 1, text: 'Các bước trong tiến trình dịch' },
      {
        type: 'list',
        ordered: true,
        items: [
          'Chuẩn bị dữ liệu — đọc chương và đoạn cần dịch',
          'Khớp thuật ngữ — áp dụng từ điển theo phạm vi ưu tiên',
          'Mở Gemini — worker mở phiên trình duyệt',
          'Đang tạo bản dịch — gửi pack và chờ phản hồi',
          'Kiểm tra — so sánh ID đoạn và chất lượng',
          'Đang sửa — repair khi thiếu đoạn hoặc lỗi cấu trúc',
          'Cập nhật bộ nhớ — ghi nhận thuật ngữ/nhân vật mới',
          'Hoàn tất — batch lưu thành công',
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Mẹo',
        body: 'Xem checklist bước trong chi tiết tiến trình (Tiến trình → Xem chi tiết).',
      },
    ],
  },
  {
    id: 'translation-style',
    categoryId: 'translation',
    title: 'Thiết lập phong cách dịch',
    description: 'Quy tắc và phong cách ảnh hưởng prompt dịch.',
    keywords: ['phong cách', 'style', 'quy tắc', 'rules', 'genre'],
    order: 3,
    relatedIds: ['term-vault', 'notebook'],
    blocks: [
      { type: 'heading', level: 1, text: 'Phong cách dịch' },
      {
        type: 'paragraph',
        text: 'Phong cách dịch được thể hiện qua Book Profile (00_BOOK_PROFILE.md), quy tắc dịch (01_TRANSLATION_RULES.md), thuật ngữ dự án và hướng dẫn gửi kèm pack dịch. Thể loại truyện (tiên hiệp, đô thị, ngôn tình…) ảnh hưởng thuật ngữ theo phạm vi GENRE.',
      },
      {
        type: 'list',
        items: [
          'Sát nguyên tác — giữ cấu trúc và từ gốc nhiều hơn',
          'Cân bằng — vừa tự nhiên vừa bám nghĩa',
          'Tự nhiên — ưu tiên câu tiếng Việt mượt',
          'Theo thể loại — dùng bộ thuật ngữ thể loại tương ứng',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Thông tin',
        body: 'Chỉnh quy tắc chi tiết trong file RULES trên Drive hoặc qua Notebook sau khi thiết lập dự án.',
      },
    ],
  },
  {
    id: 'auto-qa',
    categoryId: 'editor',
    title: 'Kiểm tra chất lượng tự động',
    description: 'Cách NovelTrans kiểm tra đoạn thiếu và repair.',
    keywords: ['qa', 'kiểm tra', 'thiếu đoạn', 'repair', 'paragraph id'],
    order: 2,
    relatedIds: ['editor', 'troubleshooting-missing', 'workflow-steps'],
    blocks: [
      { type: 'heading', level: 1, text: 'NovelTrans kiểm tra bản dịch như thế nào?' },
      {
        type: 'paragraph',
        text: 'Mỗi đoạn nguồn có ID ổn định, ví dụ [C0451:P0001]. AI phải trả cùng ID. NovelTrans kiểm tra đoạn thiếu, trùng, rỗng, ID không hợp lệ và cấu trúc output.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Thông tin',
        body: 'Nếu AI bỏ sót vài đoạn, NovelTrans chỉ gửi lại các đoạn đó — không dịch lại cả chương trừ khi cần thiết.',
      },
    ],
  },
  {
    id: 'editor',
    categoryId: 'editor',
    title: 'Chỉnh sửa bản dịch',
    description: 'Trình soạn thảo song song Trung–Việt.',
    keywords: ['editor', 'sửa', 'chỉnh sửa', 'ctrl+s', 'ctrl+f', 'version'],
    order: 1,
    relatedIds: ['auto-qa', 'shortcuts'],
    blocks: [
      { type: 'heading', level: 1, text: 'Trình biên tập' },
      {
        type: 'paragraph',
        text: 'Trang Dịch truyện hiển thị cột Trung bên trái, Việt bên phải. Click đoạn để highlight. Trạng thái đoạn: chưa dịch, đã dịch, đã sửa, cảnh báo.',
      },
      {
        type: 'list',
        items: [
          'Ctrl+S — lưu bản dịch đang chỉnh',
          'Ctrl+F — tìm trong chương',
          'Ctrl+H — bật thay thế',
          'Ctrl+G — nhảy tới kết quả tìm tiếp theo',
          'Alt+↑ / Alt+↓ — chương trước / sau',
        ],
      },
      {
        type: 'paragraph',
        text: 'Lịch sử phiên bản cho phép hoàn nguyên về bản AI trước đó. Bản chỉnh sửa của người dùng được ưu tiên và lưu version riêng.',
      },
      { type: 'actions', items: [{ label: 'Mở Dịch truyện', to: '/translation' }] },
    ],
  },
];
