import type { HelpArticle } from '../types';

export const productionFeatureArticles: HelpArticle[] = [
  {
    id: 'production-center',
    categoryId: 'jobs',
    title: 'Trung tâm sản xuất (Production Center)',
    description:
      'Theo dõi chiến dịch dịch, hàng đợi chương, xuất bản và Hộp vấn đề trên một màn hình.',
    keywords: [
      'trung tâm sản xuất',
      'production center',
      'chiến dịch',
      'campaign',
      'jobs',
    ],
    order: 5,
    relatedIds: ['translation-campaign', 'attention-inbox', 'production-tour'],
    blocks: [
      { type: 'heading', level: 1, text: 'Trung tâm sản xuất' },
      {
        type: 'paragraph',
        text: 'Mở Sản xuất (Production Center) từ thanh bên để xem chiến dịch đang chạy, tiến độ từng dự án, và các mục cần bạn xử lý.',
      },
      {
        type: 'list',
        items: [
          'Chiến dịch dịch / Translation Campaign — một cấu hình cho nhiều truyện',
          'Nhập nhiều truyện / Batch Import — quét thư viện TXT hoặc thư mục',
          'Hộp vấn đề / Attention Inbox — login, CAPTCHA, quota, xung đột nguồn',
          'Công thức dịch / Translation Recipe — Nhanh, Cân bằng, Xuất bản',
          'Kiểm tra toàn truyện / Whole-book Audit — QA cục bộ trước khi xuất',
          'Bộ truyện & Thế giới / Series & Universe — thuật ngữ và lore xuyên volume',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Chi phí',
        body: 'Khepree Novel AI không dùng API AI tính phí. Có thể phát sinh chi phí tài khoản/thuê bao của nền tảng (Google, ChatGPT, Meta…), máy tính và mạng.',
      },
      {
        type: 'actions',
        items: [{ label: 'Mở Trung tâm sản xuất', to: '/jobs' }],
      },
    ],
  },
  {
    id: 'translation-campaign',
    categoryId: 'jobs',
    title: 'Chiến dịch dịch & chọn mode',
    description: 'Tạo chiến dịch, gắn nhiều dự án và chọn Nhanh / Cân bằng / Xuất bản.',
    keywords: ['chiến dịch', 'campaign', 'recipe', 'công thức', 'mode', 'nhanh', 'xuất bản'],
    order: 6,
    relatedIds: ['batch-import', 'translation-recipes', 'production-tour'],
    blocks: [
      { type: 'heading', level: 1, text: 'Tạo chiến dịch dịch' },
      {
        type: 'steps',
        steps: [
          {
            title: 'Nhập hoặc chọn truyện',
            body: 'Dùng Nhập nhiều truyện để quét thư mục, hoặc chọn dự án có sẵn trong Thư viện dự án.',
          },
          {
            title: 'Chọn công thức dịch',
            body: 'Nhanh — ít kiểm tra, phù hợp draft. Cân bằng — QA cơ bản. Xuất bản — kiểm tra kỹ và xuất sau khi hoàn tất.',
          },
          {
            title: 'Theo dõi tại Trung tâm sản xuất',
            body: 'Pipeline tự xếp hàng, dịch, sửa lỗi và xuất. Chỉ mở Hộp vấn đề khi có login, CAPTCHA hoặc quota.',
          },
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Không phóng đại',
        body: 'Mode Xuất bản giúp giảm lỗi nhưng không đảm bảo “chất lượng hoàn hảo”. Luôn rà soát chương quan trọng trước khi phát hành.',
      },
    ],
  },
  {
    id: 'batch-import',
    categoryId: 'projects',
    title: 'Nhập nhiều truyện (Batch Import)',
    description: 'Quét thư mục chứa nhiều truyện và gắn vào chiến dịch.',
    keywords: ['batch import', 'nhập nhiều', 'thư mục', 'thư viện', 'folder'],
    order: 8,
    relatedIds: ['import-novel', 'translation-campaign'],
    blocks: [
      { type: 'heading', level: 1, text: 'Nhập nhiều truyện' },
      {
        type: 'paragraph',
        text: 'Batch Import quét cả thư mục (mỗi thư mục con hoặc file ZIP có thể là một truyện), phát hiện chương và tạo dự án tương ứng.',
      },
      {
        type: 'list',
        items: [
          'Chọn nguồn thư mục hoặc ZIP từ màn Sản xuất hoặc Dự án',
          'Xem preview: số chương, encoding, cảnh báo trùng tên',
          'Commit chỉ các truyện bạn chọn — không tự xóa dữ liệu cũ',
        ],
      },
    ],
  },
  {
    id: 'attention-inbox',
    categoryId: 'jobs',
    title: 'Hộp vấn đề (Attention Inbox)',
    description: 'Xử lý login, CAPTCHA, quota và xung đột — không cần đọc log kỹ thuật.',
    keywords: ['attention inbox', 'hộp vấn đề', 'captcha', 'quota', 'login'],
    order: 7,
    relatedIds: ['troubleshooting-login', 'troubleshooting-quota', 'troubleshooting-verify'],
    blocks: [
      { type: 'heading', level: 1, text: 'Hộp vấn đề' },
      {
        type: 'paragraph',
        text: 'Khi pipeline cần bạn (đăng nhập lại, CAPTCHA, hết quota, file nguồn mất…), mục xuất hiện trong Hộp vấn đề và Trung tâm sản xuất — không spam toast liên tục.',
      },
      {
        type: 'list',
        items: [
          'Mở mục → làm theo hành động gợi ý (đăng nhập, đổi tài khoản, mở thư mục…)',
          'Retry sau khi xử lý — pipeline tiếp tục từ checkpoint',
          'Snooze nếu cần xử lý sau',
        ],
      },
    ],
  },
  {
    id: 'translation-recipes',
    categoryId: 'jobs',
    title: 'Công thức dịch (Translation Recipe)',
    description: 'Nhanh, Cân bằng và Xuất bản — cùng một chiến dịch, khác mức kiểm tra.',
    keywords: ['recipe', 'công thức', 'fast', 'balanced', 'delivery', 'xuất bản'],
    order: 9,
    relatedIds: ['translation-campaign', 'whole-book-audit'],
    blocks: [
      { type: 'heading', level: 1, text: 'Công thức dịch' },
      {
        type: 'table',
        headers: ['Mode', 'Khi nào dùng'],
        rows: [
          ['Nhanh / Fast', 'Draft nội bộ, cần tốc độ'],
          ['Cân bằng / Balanced', 'Dịch hàng ngày với QA cơ bản'],
          ['Xuất bản / Delivery', 'Chuẩn bị export — audit + sửa lỗi tự động khi có thể'],
        ],
      },
    ],
  },
  {
    id: 'whole-book-audit',
    categoryId: 'jobs',
    title: 'Kiểm tra toàn truyện (Whole-book Audit)',
    description: 'Rà soát cục bộ tên, thuật ngữ và lỗi QA trước khi xuất.',
    keywords: ['whole book', 'audit', 'kiểm tra toàn truyện', 'qa'],
    order: 10,
    relatedIds: ['translation-recipes', 'attention-inbox'],
    blocks: [
      { type: 'heading', level: 1, text: 'Kiểm tra toàn truyện' },
      {
        type: 'paragraph',
        text: 'Whole-book Audit chạy trên máy bạn: so khớp thuật ngữ, nhân vật, lỗi QA đã lưu. Không gửi full text lên server.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Resume',
        body: 'Audit lớn có thể resume — không cần chạy lại từ đầu nếu ứng dụng tắt giữa chừng.',
      },
    ],
  },
  {
    id: 'series-universe',
    categoryId: 'projects',
    title: 'Bộ truyện & Thế giới (Series & Universe)',
    description: 'Chia sẻ thuật ngữ và lore giữa các volume — không trộn bộ khác.',
    keywords: ['series', 'bộ truyện', 'universe', 'thế giới', 'volume'],
    order: 11,
    relatedIds: ['term-vault', 'production-center'],
    blocks: [
      { type: 'heading', level: 1, text: 'Bộ truyện & Thế giới' },
      {
        type: 'paragraph',
        text: 'Gom nhiều dự án (volume) vào một Series để thuật ngữ SERIES và world state dùng chung. Dự án không cùng series không bị trộn knowledge.',
      },
      { type: 'actions', items: [{ label: 'Mở Bộ truyện', to: '/series' }] },
    ],
  },
  {
    id: 'production-tour',
    categoryId: 'start',
    title: 'Tour sản xuất (3 bước)',
    description: 'Nhập nhiều truyện → chọn mode → theo dõi Trung tâm sản xuất.',
    keywords: ['tour', 'hướng dẫn', 'production tour', 'bắt đầu'],
    order: 3,
    relatedIds: ['production-center', 'translation-campaign'],
    blocks: [
      { type: 'heading', level: 1, text: 'Tour ngắn: Sản xuất hàng loạt' },
      {
        type: 'steps',
        steps: [
          {
            title: 'Bước 1 — Nhập nhiều truyện',
            body: 'Quét thư mục thư viện TXT/ZIP và chọn truyện vào chiến dịch.',
          },
          {
            title: 'Bước 2 — Chọn Nhanh / Cân bằng / Xuất bản',
            body: 'Công thức dịch quyết định mức QA và export tự động.',
          },
          {
            title: 'Bước 3 — Trung tâm sản xuất & Hộp vấn đề',
            body: 'Theo dõi tiến độ; chỉ xử lý mục trong Hộp vấn đề khi thật sự cần.',
          },
        ],
      },
      {
        type: 'paragraph',
        text: 'Dùng nút “Chạy lại tour” bên dưới để mở overlay hướng dẫn.',
      },
    ],
  },
  {
    id: 'data-security-local',
    categoryId: 'start',
    title: 'Bảo mật dữ liệu & nội dung local',
    description: 'Dữ liệu truyện, index tìm kiếm và Help Center đọc offline trên máy.',
    keywords: ['bảo mật', 'privacy', 'local', 'offline', 'sqlite', 'không gửi server'],
    order: 4,
    relatedIds: ['backup', 'quick-start'],
    blocks: [
      { type: 'heading', level: 1, text: 'Dữ liệu ở đâu?' },
      {
        type: 'list',
        items: [
          'Truyện, bản dịch, thuật ngữ — SQLite trong AppData (máy bạn)',
          'Tìm kiếm thư viện — FTS local, không gửi từ khóa lên server',
          'Help Center — tài liệu nhúng trong app, đọc được khi offline',
          'Browser provider — phiên đăng nhập trình duyệt riêng cho automation',
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Chi phí nền tảng',
        body: 'Khepree Novel AI không dùng API AI tính phí. Tài khoản Google/ChatGPT/Meta, điện máy và mạng vẫn có thể phát sinh chi phí theo nhà cung cấp.',
      },
    ],
  },
  {
    id: 'browser-provider-login',
    categoryId: 'accounts',
    title: 'Đăng nhập browser provider',
    description: 'Đăng nhập Gemini/ChatGPT/Meta trong cửa sổ automation — không lưu mật khẩu vào SQLite.',
    keywords: ['browser', 'đăng nhập', 'gemini', 'chatgpt', 'meta', 'provider'],
    order: 12,
    relatedIds: ['google-accounts', 'troubleshooting-login'],
    blocks: [
      { type: 'heading', level: 1, text: 'Đăng nhập browser provider' },
      {
        type: 'steps',
        steps: [
          {
            title: 'Thêm tài khoản AI',
            body: 'Tài khoản AI → chọn provider → Mở đăng nhập. Cửa sổ Chromium riêng mở trang nhà cung cấp.',
          },
          {
            title: 'Hoàn tất đăng nhập',
            body: 'Đăng nhập như trên web. Khepree Novel AI lưu profile browser local, không copy mật khẩu vào DB.',
          },
          {
            title: 'Khi hết phiên',
            body: 'Hộp vấn đề báo LOGIN_REQUIRED — mở lại đăng nhập và Retry job.',
          },
        ],
      },
    ],
  },
  {
    id: 'app-updates-help',
    categoryId: 'backup',
    title: 'Cập nhật ứng dụng',
    description: 'Kiểm tra bản mới, release notes và cài đặt — không chen lên tour hay đăng nhập.',
    keywords: ['cập nhật', 'update', 'release notes', 'phiên bản'],
    order: 13,
    relatedIds: ['backup', 'production-center'],
    blocks: [
      { type: 'heading', level: 1, text: 'Cập nhật Khepree Novel AI' },
      {
        type: 'paragraph',
        text: 'Cài đặt → Cập nhật: kiểm tra bản mới, đọc release notes và cài khi sẵn sàng. Thông báo cập nhật không che tour giới thiệu hay cửa sổ đăng nhập bắt buộc.',
      },
      {
        type: 'actions',
        items: [{ label: 'Mở Cài đặt', to: '/settings?tab=advanced' }],
      },
    ],
  },
];
