import type { HelpArticle } from '../types';

export const operationsArticles: HelpArticle[] = [
  {
    id: 'jobs-monitor',
    categoryId: 'jobs',
    title: 'Theo dõi công việc dịch',
    description: 'Luồng tài khoản, hàng đợi theo dự án và thao tác điều khiển.',
    keywords: ['công việc', 'luồng', 'tiến trình', 'job', 'tạm dừng', 'ưu tiên'],
    order: 1,
    relatedIds: ['workflow-steps', 'start-translate'],
    blocks: [
      { type: 'heading', level: 1, text: 'Trang Công việc' },
      {
        type: 'paragraph',
        text: 'Xem từng tài khoản Google như một luồng: đang chạy gì, sẵn sàng hay cần xử lý. Hàng đợi nhóm theo dự án — đặt ưu tiên Cao / Bình thường / Thấp. Chi tiết kỹ thuật nằm trong mục mở rộng.',
      },
      { type: 'heading', level: 2, text: 'Trạng thái thường gặp' },
      {
        type: 'list',
        items: [
          'Đang xếp hàng / Đang chuẩn bị / Chờ worker',
          'Đang gửi / Chờ AI / Đang phân tích',
          'Kiểm tra chất lượng / Đang sửa',
          'Hoàn thành / Tạm dừng / Thất bại / Cần xử lý / Đã hủy',
        ],
      },
      {
        type: 'paragraph',
        text: 'Thao tác: Tạm dừng tất cả, Tiếp tục, Thử lại, Hủy, đổi worker (Chung pool / Gắn tài khoản), điều chỉnh ưu tiên.',
      },
      { type: 'actions', items: [{ label: 'Mở Tiến trình', to: '/jobs' }] },
    ],
  },
  {
    id: 'logs',
    categoryId: 'logs',
    title: 'Nhật ký',
    description: 'Nhật ký hoạt động và kỹ thuật.',
    keywords: ['log', 'nhật ký', 'hoạt động', 'kỹ thuật', 'lỗi'],
    order: 1,
    relatedIds: ['troubleshooting-overview'],
    blocks: [
      { type: 'heading', level: 1, text: 'Nhật ký' },
      {
        type: 'paragraph',
        text: 'Hai chế độ: Nhật ký hoạt động (dễ đọc, nên dùng hàng ngày) và Nhật ký kỹ thuật (chi tiết cho xử lý lỗi).',
      },
      {
        type: 'list',
        items: [
          'Tìm kiếm và lọc theo mức / dự án',
          'Mở thư mục log trên đĩa',
          'Xuất nhật ký khi cần gửi hỗ trợ',
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Lưu ý',
        body: 'Không chỉnh sửa file database hoặc log bằng công cụ ngoài khi NovelTrans đang chạy.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Mở Nhật ký', to: '/logs' },
          { label: 'Chẩn đoán', to: '/diagnostics' },
        ],
      },
    ],
  },
  {
    id: 'backup',
    categoryId: 'backup',
    title: 'Sao lưu và khôi phục',
    description: 'Sao lưu thủ công, tự động và phạm vi dữ liệu.',
    keywords: ['sao lưu', 'backup', 'khôi phục', 'restore'],
    order: 1,
    relatedIds: ['export-novel'],
    blocks: [
      { type: 'heading', level: 1, text: 'Sao lưu dữ liệu' },
      {
        type: 'paragraph',
        text: 'Khuyến nghị sao lưu định kỳ. Vào Cài đặt → Nâng cao → Xuất / sao lưu (hoặc trang Xuất dữ liệu) để sao lưu đầy đủ, theo dự án hoặc ảnh chụp CSDL.',
      },
      {
        type: 'list',
        items: [
          'Dự án, bản dịch, thuật ngữ, nhân vật, bộ nhớ, cài đặt',
          'Không bao gồm mật khẩu Google',
          'Hồ sơ trình duyệt có thể không nằm trong backup mặc định',
        ],
      },
      {
        type: 'paragraph',
        text: 'Tự động sao lưu: bật khoảng thời gian (giờ) và số bản giữ lại trong phần Xuất & sao lưu.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Xuất / sao lưu', to: '/export' },
          { label: 'Cài đặt', to: '/settings' },
        ],
      },
    ],
  },
  {
    id: 'export-novel',
    categoryId: 'export',
    title: 'Xuất truyện',
    description: 'Xuất TXT, DOCX, EPUB và tuỳ chọn.',
    keywords: ['xuất', 'export', 'txt', 'docx', 'epub'],
    order: 1,
    relatedIds: ['backup'],
    blocks: [
      { type: 'heading', level: 1, text: 'Xuất truyện' },
      {
        type: 'paragraph',
        text: 'Trang Xuất dữ liệu (Cài đặt → Xuất / sao lưu) hỗ trợ TXT, DOCX, EPUB. Chọn khoảng chương, chỉ bản đã dịch, tiêu đề chương và ID đoạn (tuỳ chọn). Khoảng cách đoạn bám theo bản gốc lúc nhập (dòng trống). Tuỳ chọn «chỉ đoạn đã dịch» sẽ bỏ đoạn chưa dịch — layout có thể lệch so với gốc.',
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Mẹo',
        body: 'Bản cho người đọc thường không cần Paragraph ID — tắt tuỳ chọn ID đoạn khi xuất.',
      },
      { type: 'actions', items: [{ label: 'Xuất truyện', to: '/export' }] },
    ],
  },
  {
    id: 'export-directory',
    categoryId: 'export',
    title: 'Chọn nơi lưu bản dịch',
    description: 'Thư mục xuất mặc định và override theo dự án.',
    keywords: ['xuất', 'thư mục', 'export', 'folder', 'lưu'],
    order: 2,
    relatedIds: ['export-novel'],
    blocks: [
      { type: 'heading', level: 1, text: 'Chọn nơi lưu bản dịch' },
      {
        type: 'paragraph',
        text: 'NovelTrans ưu tiên: (1) thư mục riêng của dự án nếu đã cấu hình; (2) thư mục xuất mặc định toàn cục; (3) hỏi một lần khi xuất lần đầu. Sau khi thiết lập, xuất TXT/DOCX không mở hộp thoại Save As mỗi lần.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Lưu ý',
        body: 'Đổi thư mục mặc định không thay đổi thư mục riêng của các dự án đã cấu hình.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Cài đặt xuất', to: '/settings?tab=storage' },
          { label: 'Xuất dự án', to: '/export' },
        ],
      },
    ],
  },
];
