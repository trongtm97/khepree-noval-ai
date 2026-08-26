import type { HelpArticle } from '../types';

const troubleshootingSteps = (steps: string[]) => ({
  type: 'steps' as const,
  steps: steps.map((body, i) => ({ title: `Bước ${i + 1}`, body })),
});

export const troubleshootingArticles: HelpArticle[] = [
  {
    id: 'troubleshooting-overview',
    categoryId: 'troubleshooting',
    title: 'Xử lý lỗi thường gặp',
    description: 'Tổng quan các sự cố và hướng xử lý.',
    keywords: ['lỗi', 'sự cố', 'troubleshooting', 'xử lý'],
    order: 0,
    relatedIds: [
      'troubleshooting-login',
      'troubleshooting-quota',
      'troubleshooting-selector',
    ],
    blocks: [
      { type: 'heading', level: 1, text: 'Xử lý lỗi thường gặp' },
      {
        type: 'paragraph',
        text: 'Chọn chủ đề bên trái hoặc dùng tìm kiếm. Mỗi bài có các bước cụ thể. Khi cần, mở Nhật ký hoặc xuất gói chẩn đoán.',
      },
      {
        type: 'list',
        items: [
          'Tài khoản cần đăng nhập lại',
          'Google yêu cầu xác minh',
          'Gemini chạm giới hạn',
          'Gemini không phản hồi',
          'Notebook không đồng bộ',
          'AI bỏ sót nội dung',
          'Automation không tìm thấy nút Gemini',
          'Phần mềm đóng giữa lúc dịch',
        ],
      },
      {
        type: 'actions',
        items: [
          { label: 'Nhật ký', to: '/logs' },
          { label: 'Chẩn đoán', to: '/diagnostics' },
          { label: 'Tài khoản Google', to: '/accounts' },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting-login',
    categoryId: 'troubleshooting',
    title: 'Tài khoản cần đăng nhập lại',
    description: 'Khôi phục phiên Google hết hạn.',
    keywords: ['đăng nhập', 'login', 'login_required', 'phiên', 'hết hạn'],
    order: 1,
    relatedIds: ['google-accounts', 'troubleshooting-verify'],
    blocks: [
      { type: 'heading', level: 1, text: 'Tài khoản Google cần đăng nhập lại' },
      troubleshootingSteps([
        'Đi tới Tài khoản Google.',
        'Chọn tài khoản báo Cần đăng nhập lại.',
        'Nhấn Mở trình duyệt hoặc Mở Gemini.',
        'Đăng nhập lại trong cửa sổ Google.',
        'Quay lại NovelTrans, nhấn Kiểm tra phiên.',
        'Tiếp tục hoặc Thử lại tiến trình đang chờ.',
      ]),
    ],
  },
  {
    id: 'troubleshooting-verify',
    categoryId: 'troubleshooting',
    title: 'Google yêu cầu xác minh',
    description: 'CAPTCHA và xác thực hai bước.',
    keywords: ['xác minh', 'captcha', 'verify', 'challenge'],
    order: 2,
    relatedIds: ['troubleshooting-login'],
    blocks: [
      { type: 'heading', level: 1, text: 'Google yêu cầu xác minh' },
      {
        type: 'paragraph',
        text: 'NovelTrans tạm dừng tiến trình và hiển thị cảnh báo. Nhấn Xử lý hoặc Mở trình duyệt, hoàn thành bước xác minh trong cửa sổ Google, sau đó Tiếp tục tiến trình.',
      },
    ],
  },
  {
    id: 'troubleshooting-quota',
    categoryId: 'troubleshooting',
    title: 'Gemini đã chạm giới hạn',
    description: 'Hết hạn mức và chuyển tài khoản.',
    keywords: ['quota', 'giới hạn', 'hạn mức', 'limited', 'ultra'],
    order: 3,
    relatedIds: ['multi-accounts'],
    blocks: [
      { type: 'heading', level: 1, text: 'Gemini đã chạm giới hạn' },
      {
        type: 'list',
        items: [
          'Chờ tài khoản hồi hạn mức (thường theo ngày/gói)',
          'Đổi sang tài khoản Google khác đang Sẵn sàng',
          'Dùng chế độ Chung pool để worker tự xoay',
          'Tạm dừng tiến trình và tiếp tục sau',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting-timeout',
    categoryId: 'troubleshooting',
    title: 'Gemini không phản hồi',
    description: 'Timeout và mạng chậm.',
    keywords: ['timeout', 'phản hồi', 'chậm', 'mạng', 'gemini'],
    order: 4,
    relatedIds: ['logs', 'troubleshooting-network'],
    blocks: [
      { type: 'heading', level: 1, text: 'Gemini không phản hồi' },
      troubleshootingSteps([
        'Kiểm tra kết nối mạng.',
        'Mở Gemini bằng tài khoản worker đó (Tài khoản Google → Mở Gemini).',
        'Trong Tiến trình, nhấn Thử lại.',
        'Nếu vẫn lỗi, xem Nhật ký hoạt động và Nhật ký kỹ thuật.',
      ]),
    ],
  },
  {
    id: 'troubleshooting-network',
    categoryId: 'troubleshooting',
    title: 'Mất kết nối mạng',
    description: 'Lỗi mạng khi gọi Gemini.',
    keywords: ['mạng', 'network', 'internet', 'kết nối'],
    order: 5,
    relatedIds: ['troubleshooting-timeout'],
    blocks: [
      { type: 'heading', level: 1, text: 'Mất kết nối mạng' },
      {
        type: 'paragraph',
        text: 'Kiểm tra Wi-Fi/Ethernet, VPN và firewall. Khởi động lại router nếu cần. Sau khi mạng ổn, Thử lại tiến trình.',
      },
    ],
  },
  {
    id: 'troubleshooting-notebook',
    categoryId: 'troubleshooting',
    title: 'Notebook không đồng bộ',
    description: 'Drive và NotebookLM lệch dữ liệu, hoặc lỗi UI not available.',
    keywords: [
      'notebook',
      'đồng bộ',
      'sync',
      'drive',
      'ui not available',
      'resume',
      'selector',
    ],
    order: 6,
    relatedIds: ['notebook', 'google-drive', 'troubleshooting-selector'],
    blocks: [
      { type: 'heading', level: 1, text: 'Notebook không đồng bộ / UI not available' },
      {
        type: 'paragraph',
        text: 'Lỗi "NotebookLM UI not available" nghĩa là Playwright chưa nhận diện được giao diện notebooklm.google.com (chưa login, trang trống, hoặc Google đổi DOM).',
      },
      troubleshootingSteps([
        'Nếu lỗi "Browser profile already in use": đóng cửa sổ Chromium của tài khoản (Accounts → Đóng trình duyệt), rồi Resume lại. App sẽ tự đóng session cũ trước khi mở Notebook.',
        'Accounts → Open Browser → đăng nhập Google / mở https://notebooklm.google.com/ đến khi thấy danh sách notebook.',
        'Đảm bảo Drive đã Connect và folder dự án đã có file 00_BOOK_PROFILE.md … 05_STORY_STATE.md.',
        'Dịch truyện → Tiếp tục Notebook (Resume). Browser sẽ mở headed — hoàn tất tạo notebook / thêm nguồn / Configure → Custom.',
        'Tên notebook phải đúng dạng: [NovelTrans] <tên dự án>.',
        'Vẫn lỗi: Chẩn đoán → Test Notebook / Interactive repair để ghi đè selector.',
      ]),
    ],
  },
  {
    id: 'troubleshooting-missing',
    categoryId: 'troubleshooting',
    title: 'AI bỏ sót nội dung',
    description: 'Đoạn thiếu và repair tự động.',
    keywords: ['thiếu', 'bỏ sót', 'missing', 'repair', 'paragraph'],
    order: 7,
    relatedIds: ['auto-qa'],
    blocks: [
      { type: 'heading', level: 1, text: 'AI bỏ sót nội dung' },
      {
        type: 'paragraph',
        text: 'NovelTrans thường tự phát hiện ID đoạn thiếu và chạy repair. Nếu vẫn còn: Tiến trình → Xem chi tiết → Thử lại, hoặc sửa thủ công trong Dịch truyện.',
      },
    ],
  },
  {
    id: 'troubleshooting-selector',
    categoryId: 'troubleshooting',
    title: 'Giao diện Gemini có thể đã thay đổi',
    description: 'Lỗi selector automation.',
    keywords: ['selector', 'automation', 'gemini', 'giao diện', 'nút'],
    order: 8,
    relatedIds: ['logs'],
    blocks: [
      { type: 'heading', level: 1, text: 'Automation không tìm thấy nút Gemini' },
      {
        type: 'paragraph',
        text: 'Thông báo "Giao diện Gemini có thể đã thay đổi" nghĩa là selector DOM không khớp. Thử lại, mở Gemini thủ công, hoặc dùng Chế độ sửa tương tác trong Chẩn đoán để ghi đè selector.',
      },
      {
        type: 'actions',
        items: [{ label: 'Mở Chẩn đoán', to: '/diagnostics' }],
      },
    ],
  },
  {
    id: 'troubleshooting-crash',
    categoryId: 'troubleshooting',
    title: 'Phần mềm đóng giữa lúc dịch',
    description: 'Khôi phục hàng đợi sau khi mở lại.',
    keywords: ['crash', 'đóng', 'khôi phục', 'queue', 'mất dữ liệu'],
    order: 9,
    relatedIds: ['jobs-monitor'],
    blocks: [
      { type: 'heading', level: 1, text: 'Phần mềm bị đóng giữa lúc dịch' },
      {
        type: 'paragraph',
        text: 'Mở lại NovelTrans. Hàng đợi tiến trình tự khôi phục — tiến trình dang dở có thể quay về đang chờ hoặc cần Thử lại. Dữ liệu dự án và bản dịch đã lưu không mất.',
      },
    ],
  },
];

export const metaArticles: HelpArticle[] = [
  {
    id: 'faq',
    categoryId: 'faq',
    title: 'Câu hỏi thường gặp',
    description: 'FAQ nhanh cho người mới.',
    keywords: ['faq', 'hỏi', 'câu hỏi'],
    order: 1,
    blocks: [
      { type: 'heading', level: 1, text: 'Câu hỏi thường gặp' },
      {
        type: 'faq',
        items: [
          {
            q: 'Tôi có cần Gemini API không?',
            a: 'Không với chế độ dịch qua tài khoản Google và trình duyệt tự động hóa. Bạn dùng Gemini web như người dùng thông thường.',
          },
          {
            q: 'Tôi có thể thêm nhiều tài khoản Google không?',
            a: 'Có. Mỗi tài khoản là một worker riêng với profile trình duyệt riêng.',
          },
          {
            q: 'NovelTrans có lưu mật khẩu Google không?',
            a: 'Không. Chỉ lưu hồ sơ trình duyệt đã đăng nhập trên máy bạn.',
          },
          {
            q: 'Dịch hàng nghìn chương được không?',
            a: 'Có. Dùng Dịch cả truyện để xếp hàng từng chương; theo dõi trong Tiến trình.',
          },
          {
            q: 'Gemini dịch thiếu thì sao?',
            a: 'NovelTrans phát hiện ID đoạn thiếu và tạo repair — xem mục Kiểm tra chất lượng tự động.',
          },
          {
            q: 'Sửa bản dịch tay được không?',
            a: 'Có. Bản bạn sửa lưu version riêng và ưu tiên hơn bản AI.',
          },
          {
            q: 'Đổi tài khoản Google có mất dữ liệu truyện không?',
            a: 'Không. Dữ liệu chính nằm trong NovelTrans trên máy bạn.',
          },
        ],
      },
    ],
  },
  {
    id: 'shortcuts',
    categoryId: 'shortcuts',
    title: 'Phím tắt',
    description: 'Phím tắt toàn cục và trong trình soạn thảo.',
    keywords: ['phím tắt', 'shortcut', 'keyboard', 'ctrl'],
    order: 1,
    blocks: [
      { type: 'heading', level: 1, text: 'Phím tắt' },
      {
        type: 'table',
        headers: ['Phím', 'Thao tác'],
        rows: [
          ['Ctrl+,', 'Mở Cài đặt'],
          ['F1', 'Mở Hướng dẫn (theo trang hiện tại)'],
          ['Ctrl+S', 'Lưu (trong Dịch truyện)'],
          ['Ctrl+F', 'Tìm kiếm (trong Dịch truyện)'],
          ['Ctrl+H', 'Thay thế (trong Dịch truyện)'],
          ['Ctrl+G', 'Kết quả tìm tiếp theo (editor)'],
          ['Alt+↑ / Alt+↓', 'Chương trước / sau (editor)'],
          ['Esc', 'Đóng hộp thoại / drawer'],
        ],
      },
    ],
  },
  {
    id: 'glossary',
    categoryId: 'glossary',
    title: 'Thuật ngữ trong NovelTrans',
    description: 'Giải thích thuật ngữ kỹ thuật đơn giản.',
    keywords: ['glossary', 'worker', 'batch', 'vault', 'qa'],
    order: 1,
    blocks: [
      { type: 'heading', level: 1, text: 'Từ điển thuật ngữ NovelTrans' },
      {
        type: 'table',
        headers: ['Thuật ngữ', 'Nghĩa'],
        rows: [
          ['Worker', 'Tài khoản Google mà NovelTrans dùng chạy AI'],
          ['Batch / Lô chương', 'Nhóm chương xử lý trong một lượt'],
          ['Kho thuật ngữ', 'Từ điển dịch có phạm vi và ưu tiên'],
          ['Bộ nhớ truyện', 'Nhân vật, quan hệ, cốt truyện… của một bộ truyện'],
          ['Metadata / Thông tin truyện', 'Tên, tác giả, mô tả… — không lưu như chương'],
          ['Book Profile', 'Tóm tắt metadata compact gửi AI và file 00_BOOK_PROFILE.md'],
          ['Tóm tắt chính thức', 'Mô tả ban đầu từ nguồn — khác trạng thái truyện khi dịch'],
          ['Chương mở đầu (Prologue)', 'Nội dung truyện trước Chương 1 (序章, 楔子…)'],
          ['Notebook', 'Không gian kiến thức NotebookLM hỗ trợ Gemini'],
          ['Repair', 'Tiến trình sửa lỗi khi AI thiếu/sai đoạn'],
          ['Kiểm tra chất lượng (QA)', 'Tự động so khớp ID và chất lượng bản dịch'],
        ],
      },
    ],
  },
];
