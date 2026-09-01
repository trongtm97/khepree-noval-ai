import type { HelpArticle } from '../types';

export const aiProviderArticles: HelpArticle[] = [
  {
    id: 'ai-providers',
    categoryId: 'accounts',
    title: 'Nhà cung cấp AI',
    description: 'Gemini Browser vs Gemini Web API — khi nào dùng cái nào.',
    keywords: [
      'ai',
      'provider',
      'gemini web api',
      'playwright',
      'cookie',
      'fallback',
      'nhà cung cấp',
    ],
    order: 5,
    relatedIds: ['google-accounts', 'troubleshooting-login', 'troubleshooting-quota'],
    blocks: [
      { type: 'heading', level: 1, text: 'Nhà cung cấp AI' },
      {
        type: 'paragraph',
        text: 'Khepree Novel AI dịch qua lớp AI Provider Manager. Translation Engine không biết backend là Playwright hay Web API.',
      },
      { type: 'heading', level: 2, text: 'Gemini Browser' },
      {
        type: 'list',
        ordered: false,
        items: [
          'Dùng Playwright điều khiển giao diện Gemini / NotebookLM.',
          'Cần tài khoản Google + notebook mapping sẵn sàng.',
          'Phụ thuộc DOM — dễ hỏng khi Google đổi giao diện.',
        ],
      },
      { type: 'heading', level: 2, text: 'Gemini Web API' },
      {
        type: 'list',
        ordered: false,
        items: [
          'Kết nối nền qua gemini-web2api (Python worker localhost, OpenAI-compatible).',
          'Thường nhanh hơn, ít phụ thuộc giao diện — phù hợp nhiều batch.',
          'Cần duy trì session cookie Google (__Secure-1PSID / PSIDTS).',
          'Có thể thay đổi khi Google cập nhật web API nội bộ.',
        ],
      },
      {
        type: 'steps',
        steps: [
          {
            title: 'Worker (Web API)',
            body: 'Bản cài Windows có NovelTransGeminiWorker.exe — không cần Python. Dev: Cài đặt → Nhà cung cấp AI → Cài worker (Python 3.11+).',
          },
          {
            title: 'Thêm tài khoản',
            body: 'Thêm tài khoản AI, dán cookie từ gemini.google.com (DevTools → Network).',
          },
          {
            title: 'Đặt ưu tiên',
            body: 'Ưu tiên 1 = Web API, ưu tiên 2 = Browser. Bật fallback khi RATE_LIMIT nếu muốn.',
          },
          {
            title: 'Bắt đầu dịch',
            body: 'Enqueue job như bình thường — manager chọn provider READY.',
          },
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Bảo mật',
        body: 'Không lưu mật khẩu Google. Cookie chỉ lưu dạng mã hóa (safeStorage). Worker chỉ lắng nghe 127.0.0.1.',
      },
      {
        type: 'actions',
        items: [{ label: 'Mở Cài đặt AI', to: '/settings?tab=ai' }],
      },
    ],
  },
];
