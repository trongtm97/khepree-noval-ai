import { introArticles } from './intro';
import { accountArticles } from './accounts';
import { aiProviderArticles } from './ai-providers';
import { projectArticles } from './projects';
import { bookMetadataArticles } from './book-metadata';
import { translationArticles } from './translation';
import { termsMemoryArticles } from './terms-memory';
import { operationsArticles } from './operations';
import { troubleshootingArticles, metaArticles } from './troubleshooting';
import type { HelpArticle, HelpCategory } from '../types';

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: 'start', label: 'Bắt đầu', order: 1 },
  { id: 'accounts', label: 'Tài khoản', order: 2 },
  { id: 'projects', label: 'Dự án', order: 3 },
  { id: 'translation', label: 'Dịch truyện', order: 4 },
  { id: 'terms', label: 'Thuật ngữ', order: 5 },
  { id: 'characters', label: 'Nhân vật', order: 6 },
  { id: 'notebook', label: 'Notebook', order: 7 },
  { id: 'jobs', label: 'Tiến trình', order: 8 },
  { id: 'editor', label: 'Chỉnh sửa', order: 9 },
  { id: 'logs', label: 'Nhật ký', order: 10 },
  { id: 'backup', label: 'Sao lưu', order: 11 },
  { id: 'export', label: 'Xuất truyện', order: 12 },
  { id: 'troubleshooting', label: 'Xử lý lỗi', order: 13 },
  { id: 'faq', label: 'FAQ', order: 14 },
  { id: 'shortcuts', label: 'Phím tắt', order: 15 },
  { id: 'glossary', label: 'Thuật ngữ NT', order: 16 },
];

export const HELP_ARTICLES: HelpArticle[] = [
  ...introArticles,
  ...accountArticles,
  ...aiProviderArticles,
  ...projectArticles,
  ...bookMetadataArticles,
  ...translationArticles,
  ...termsMemoryArticles,
  ...operationsArticles,
  ...troubleshootingArticles,
  ...metaArticles,
].sort((a, b) => a.order - b.order);

export const HELP_ARTICLE_MAP = new Map(HELP_ARTICLES.map((a) => [a.id, a]));

export function getHelpArticle(id: string | undefined): HelpArticle | undefined {
  if (!id) return HELP_ARTICLE_MAP.get(getDefaultArticleId());
  return HELP_ARTICLE_MAP.get(id) ?? HELP_ARTICLE_MAP.get(getDefaultArticleId());
}

export function getDefaultArticleId(): string {
  return 'quick-start';
}

/** Map app route → default help article for F1 / context help */
export const ROUTE_HELP_ARTICLE: Record<string, string> = {
  '/': 'quick-start',
  '/accounts': 'google-accounts',
  '/projects': 'import-novel',
  '/translation': 'start-translate',
  '/editor': 'start-translate',
  '/terms': 'term-vault',
  '/characters': 'characters',
  '/jobs': 'jobs-monitor',
  '/logs': 'logs',
  '/settings': 'ai-providers',
  '/export': 'export-novel',
  '/learning': 'term-vault',
  '/diagnostics': 'troubleshooting-selector',
  '/help': 'quick-start',
};

export function helpArticleForRoute(pathname: string): string {
  if (ROUTE_HELP_ARTICLE[pathname]) return ROUTE_HELP_ARTICLE[pathname];
  if (/^\/projects\/[^/]+\/info\/?$/.test(pathname)) return 'project-info';
  if (/^\/projects\/[^/]+\/source\/?$/.test(pathname)) return 'source-file-types';
  if (pathname.startsWith('/help/')) {
    const id = pathname.slice('/help/'.length).split('/')[0];
    return HELP_ARTICLE_MAP.has(id) ? id : getDefaultArticleId();
  }
  return getDefaultArticleId();
}

/** Error codes → troubleshooting article */
export const ERROR_HELP_ARTICLE: Record<string, string> = {
  SESSION_EXPIRED: 'troubleshooting-login',
  RATE_LIMIT: 'troubleshooting-quota',
  LOGIN_REQUIRED: 'troubleshooting-login',
  CAPTCHA: 'troubleshooting-verify',
  QUOTA_LIMIT: 'troubleshooting-quota',
  SELECTOR_NOT_FOUND: 'troubleshooting-selector',
  NETWORK_ERROR: 'troubleshooting-network',
  RESPONSE_TIMEOUT: 'troubleshooting-timeout',
};

export function searchHelpArticles(query: string): { article: HelpArticle; score: number; snippet: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const terms = q.split(/\s+/).filter(Boolean);
  const results: { article: HelpArticle; score: number; snippet: string }[] = [];

  for (const article of HELP_ARTICLES) {
    let score = 0;
    const haystackParts: string[] = [
      article.title,
      article.description,
      ...article.keywords,
    ];
    for (const block of article.blocks) {
      if (block.type === 'paragraph') haystackParts.push(block.text);
      if (block.type === 'heading') haystackParts.push(block.text);
      if (block.type === 'list') haystackParts.push(...block.items);
      if (block.type === 'steps') {
        for (const s of block.steps) {
          haystackParts.push(s.title, s.body);
        }
      }
      if (block.type === 'callout') haystackParts.push(block.title, block.body);
      if (block.type === 'faq') {
        for (const f of block.items) haystackParts.push(f.q, f.a);
      }
    }
    const haystack = haystackParts.join(' ').toLowerCase();

    for (const term of terms) {
      if (article.title.toLowerCase().includes(term)) score += 8;
      if (article.keywords.some((k) => k.toLowerCase().includes(term))) score += 5;
      if (article.description.toLowerCase().includes(term)) score += 3;
      if (haystack.includes(term)) score += 2;
    }

    if (score > 0) {
      const idx = haystack.indexOf(terms[0] ?? '');
      const snippet =
        idx >= 0
          ? haystack.slice(Math.max(0, idx - 20), idx + 80).trim()
          : article.description;
      results.push({ article, score, snippet });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function helpArticleForErrorCode(code: string): string | undefined {
  return ERROR_HELP_ARTICLE[code];
}
