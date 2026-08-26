import type { HelpArticle } from '../types';

export const introArticles: HelpArticle[] = [
  {
    id: 'intro',
    categoryId: 'start',
    title: 'NovelTrans Studio là gì?',
    description: 'Giới thiệu phần mềm dịch tiểu thuyết Trung–Việt bằng Gemini.',
    keywords: ['giới thiệu', 'noveltrans', 'gemini', 'dịch truyện', 'là gì'],
    order: 1,
    relatedIds: ['quick-start', 'google-accounts'],
    blocks: [
      {
        type: 'heading',
        level: 1,
        text: 'NovelTrans Studio là gì?',
      },
      {
        type: 'paragraph',
        text: 'NovelTrans Studio là phần mềm Windows hỗ trợ dịch tiểu thuyết Trung Quốc sang tiếng Việt bằng Google Gemini qua tài khoản Google của bạn.',
      },
      {
        type: 'paragraph',
        text: 'Phần mềm giúp tự động hóa các công việc:',
      },
      {
        type: 'list',
        items: [
          'Chia truyện thành chương và đoạn có ID ổn định',
          'Gửi nội dung sang Gemini và nhận bản dịch',
          'Dùng bộ nhớ truyện, thuật ngữ và nhân vật để giữ nhất quán',
          'Kiểm tra đoạn bị thiếu và tự sửa khi AI bỏ sót',
          'Quản lý nhiều tài khoản Google (worker) song song',
          'Lưu, chỉnh sửa và xuất truyện hoàn chỉnh',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Thông tin',
        body: 'NovelTrans không dùng tài khoản Google chung. Mỗi người dùng thêm tài khoản Google riêng. Dữ liệu truyện lưu trên máy tính của bạn (AppData).',
      },
    ],
  },
  {
    id: 'quick-start',
    categoryId: 'start',
    title: 'Bắt đầu nhanh',
    description: 'Năm bước để thêm Google, nhập truyện và bắt đầu dịch.',
    keywords: ['bắt đầu', 'quick start', 'hướng dẫn', 'lần đầu', 'thiết lập'],
    order: 2,
    relatedIds: ['google-accounts', 'import-novel', 'book-metadata-prep', 'start-translate', 'setup-checklist'],
    blocks: [
      { type: 'heading', level: 1, text: 'Bắt đầu trong 5 bước' },
      {
        type: 'steps',
        steps: [
          {
            title: 'Thêm tài khoản Google',
            body: 'Đi tới Tài khoản Google → Thêm tài khoản Google. Đăng nhập Gemini trong cửa sổ trình duyệt riêng. Trạng thái chuyển Sẵn sàng khi phiên hợp lệ.',
          },
          {
            title: 'Kết nối Google Drive (tuỳ chọn nhưng khuyến nghị)',
            body: 'Trên thẻ tài khoản, chọn Kết nối Drive. Drive dùng để đồng bộ file kiến thức phục vụ NotebookLM.',
          },
          {
            title: 'Nhập truyện',
            body: 'Đi tới Dự án → Tạo dự án → chọn thư mục TXT (tuỳ chọn: _BOOK_INFO.txt, 序章…). Quét, kiểm tra preview metadata và chương, rồi xác nhận nhập.',
          },
          {
            title: 'Kiểm tra thiết lập',
            body: 'Chọn dự án trong Dịch truyện. Thiết lập Notebook cho dự án nếu cần ngữ cảnh bổ sung. Chọn tài khoản worker phù hợp.',
          },
          {
            title: 'Bắt đầu dịch',
            body: 'Trong Dịch truyện, nhấn Tự động dịch hoặc tạo tiến trình từ trang Tiến trình. Theo dõi trạng thái và xử lý cảnh báo nếu có.',
          },
        ],
      },
      {
        type: 'actions',
        items: [
          { label: 'Thêm tài khoản Google', to: '/accounts' },
          { label: 'Tạo dự án / Nhập truyện', to: '/projects' },
          { label: 'Bắt đầu dịch', to: '/translation' },
        ],
      },
    ],
  },
];
