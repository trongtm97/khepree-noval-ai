import type { HelpArticle } from '../types';

export const contactArticles: HelpArticle[] = [
  {
    id: 'contact',
    categoryId: 'support',
    title: 'Liên hệ & cộng đồng',
    description: 'Kết nối với Khepree Labs qua các kênh chính thức.',
    keywords: [
      'liên hệ',
      'contact',
      'cộng đồng',
      'community',
      'facebook',
      'youtube',
      'tiktok',
      'telegram',
      'zalo',
      'hỗ trợ',
      'support',
      'khepree labs',
    ],
    order: 1,
    relatedIds: ['troubleshooting-overview', 'faq'],
    blocks: [{ type: 'official-contacts' }],
  },
];
