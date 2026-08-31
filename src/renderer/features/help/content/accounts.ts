import type { HelpArticle } from '../types';

export const accountArticles: HelpArticle[] = [
  {
    id: 'google-accounts',
    categoryId: 'accounts',
    title: 'Thêm tài khoản Google',
    description: 'Đăng nhập Gemini qua trình duyệt riêng và hiểu trạng thái worker.',
    keywords: ['google', 'tài khoản', 'đăng nhập', 'gemini', 'worker', 'thêm'],
    order: 1,
    relatedIds: ['google-drive', 'multi-accounts', 'troubleshooting-login'],
    blocks: [
      { type: 'heading', level: 1, text: 'Thêm tài khoản Google' },
      {
        type: 'paragraph',
        text: 'Đi tới Tài khoản AI → phần Google / Gemini → Thêm tài khoản Google. Khepree Novel AI mở cửa sổ trình duyệt riêng (browser profile) — không dùng chung Chrome mặc định.',
      },
      {
        type: 'paragraph',
        text: 'Đăng nhập tài khoản Google muốn dùng. Nếu Google yêu cầu mật khẩu, mã xác minh, xác thực hai bước hoặc CAPTCHA, bạn hoàn thành trực tiếp trong cửa sổ đó.',
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Quan trọng',
        body: 'Khepree Novel AI KHÔNG lưu mật khẩu Google. Chỉ lưu hồ sơ trình duyệt cục bộ đã đăng nhập.',
      },
      { type: 'heading', level: 2, text: 'Các trạng thái tài khoản' },
      {
        type: 'table',
        headers: ['Trạng thái', 'Ý nghĩa'],
        rows: [
          ['Sẵn sàng', 'Có thể dùng cho dịch'],
          ['Đang chạy / Bận', 'Worker đang xử lý tiến trình'],
          ['Cần xử lý', 'Google yêu cầu tương tác (đăng nhập lại, xác minh)'],
          ['Đã chạm giới hạn', 'Gemini tạm không tiếp tục vì hạn mức'],
          ['Cần đăng nhập lại', 'Phiên Google không còn hợp lệ'],
          ['Đã tắt', 'Worker bị vô hiệu hoá — bật lại trong thẻ tài khoản'],
        ],
      },
      {
        type: 'paragraph',
        text: 'Sau khi đăng nhập, dùng Kiểm tra phiên hoặc Mở Gemini để xác nhận. Nút Mở trình duyệt mở lại hồ sơ worker khi cần đăng nhập thủ công.',
      },
      {
        type: 'actions',
        items: [{ label: 'Mở Tài khoản AI', to: '/accounts' }],
      },
    ],
  },
  {
    id: 'multi-accounts',
    categoryId: 'accounts',
    title: 'Nhiều tài khoản Google',
    description: 'Worker pool, chế độ cố định và xoay tài khoản khi hết hạn mức.',
    keywords: ['nhiều tài khoản', 'pool', 'pinned', 'worker', 'ultra', 'pro'],
    order: 2,
    relatedIds: ['google-accounts', 'jobs-monitor', 'troubleshooting-quota'],
    blocks: [
      { type: 'heading', level: 1, text: 'Sử dụng nhiều tài khoản' },
      {
        type: 'paragraph',
        text: 'Khepree Novel AI cho phép thêm nhiều tài khoản Google. Mỗi tài khoản có browser profile riêng, phiên Google riêng và trạng thái worker riêng.',
      },
      { type: 'heading', level: 2, text: 'Chế độ Gắn tài khoản (PINNED)' },
      {
        type: 'paragraph',
        text: 'Một tiến trình luôn dùng một tài khoản cụ thể. Phù hợp khi mỗi dự án gắn một Google cố định.',
      },
      { type: 'heading', level: 2, text: 'Chế độ Chung pool (POOL)' },
      {
        type: 'paragraph',
        text: 'Khepree Novel AI chọn worker đang Sẵn sàng trong nhóm. Khi một tài khoản chạm hạn mức, tiến trình có thể chuyển sang worker khác nếu cấu hình cho phép.',
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Mẹo',
        body: 'Đổi chế độ worker trong chi tiết tiến trình (Tiến trình → Xem chi tiết → Tài khoản).',
      },
    ],
  },
  {
    id: 'google-drive',
    categoryId: 'accounts',
    title: 'Kết nối Google Drive',
    description: 'OAuth Client ID, redirect URI 127.0.0.1:18766, và kết nối Drive theo tài khoản.',
    keywords: [
      'drive',
      'google drive',
      'kết nối',
      'oauth',
      'client id',
      'redirect',
      '127.0.0.1',
      'notebook',
    ],
    order: 3,
    relatedIds: ['notebook', 'troubleshooting-notebook', 'book-profile', 'project-info'],
    blocks: [
      { type: 'heading', level: 1, text: 'Kết nối Google Drive' },
      {
        type: 'paragraph',
        text: 'Drive lưu file kiến thức cho NotebookLM và đồng bộ dự án. Trước khi Connect Drive, cần Client ID OAuth (Desktop app) trong Cài đặt.',
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Hướng dẫn đầy đủ trong trình duyệt',
        body: 'Cài đặt → Google Drive → «Xem hướng dẫn chi tiết (trình duyệt)» mở trang HTML từng bước (tạo GCP, Desktop client, redirect URI, khắc phục redirect_uri_mismatch).',
      },
      { type: 'heading', level: 2, text: 'Redirect URI đúng' },
      {
        type: 'paragraph',
        text: 'App dùng cố định: http://127.0.0.1:18766 — không dùng localhost, không thêm /oauth2callback. Client kiểu Desktop app không cần khai báo URI; nếu lỡ tạo Web thì phải thêm đúng chuỗi này vào Authorized redirect URIs.',
      },
      {
        type: 'steps',
        steps: [
          {
            title: 'Cài đặt OAuth',
            body: 'Cài đặt → Google Drive → dán Client ID → Lưu (badge Đã cấu hình). Client Secret tuỳ chọn.',
          },
          {
            title: 'Tài khoản Google',
            body: 'Thêm / đăng nhập Gemini nếu chưa có.',
          },
          {
            title: 'Kết nối Drive',
            body: 'Bấm Đã kết nối · Google Drive → Cho phép trên Google trong trình duyệt hệ thống.',
          },
        ],
      },
      {
        type: 'list',
        items: [
          '00_BOOK_PROFILE.md — Hồ sơ truyện',
          '01_TRANSLATION_RULES.md — Quy tắc dịch',
          '02_PROJECT_TERMS.md — Thuật ngữ dự án',
          '03_CHARACTERS.md — Nhân vật',
          '04_RELATIONSHIPS.md — Quan hệ và xưng hô',
          '05_STORY_STATE.md — Trạng thái cốt truyện',
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Lỗi 400 redirect_uri_mismatch',
        body: 'Sai kiểu client (phải Desktop) hoặc URI không khớp. Mở hướng dẫn HTML trong Cài đặt để copy URI đúng và checklist.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Cài đặt Google Drive', to: '/settings?tab=ai' },
          { label: 'Tài khoản Google', to: '/accounts' },
        ],
      },
    ],
  },
];
