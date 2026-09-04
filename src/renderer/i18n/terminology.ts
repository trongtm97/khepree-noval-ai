/**
 * User-facing terminology map (VI primary).
 * Domain code / IPC names stay English; only presentation uses these.
 */
export const USER_TERMS = {
  project: { vi: 'Dự án', en: 'Project' },
  campaign: { vi: 'Chiến dịch', en: 'Campaign' },
  queue: { vi: 'Hàng đợi', en: 'Queue' },
  attention: { vi: 'Cần bạn xử lý', en: 'Needs your action' },
  retry: { vi: 'Thử lại', en: 'Retry' },
  binding: { vi: 'Liên kết', en: 'Link' },
  worldKnowledge: { vi: 'Kiến thức dùng chung', en: 'Shared knowledge' },
  seriesWorld: { vi: 'Kiến thức thế giới', en: 'World knowledge' },
  notebook: { vi: 'Notebook', en: 'Notebook' },
  production: { vi: 'Trung tâm sản xuất', en: 'Production center' },
  series: { vi: 'Bộ truyện', en: 'Series' },
  translate: { vi: 'Dịch', en: 'Translate' },
  librarySearch: { vi: 'Tìm thư viện', en: 'Library search' },
  aiMemory: { vi: 'Bộ nhớ AI', en: 'AI Memory' },
} as const;
