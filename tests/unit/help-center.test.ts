import { describe, expect, it } from 'vitest';
import {
  HELP_ARTICLES,
  HELP_ARTICLE_MAP,
  getDefaultArticleId,
  getHelpArticle,
  helpArticleForRoute,
  helpArticleForErrorCode,
  searchHelpArticles,
} from '../../src/renderer/features/help/content';

describe('help center content', () => {
  it('has all required articles', () => {
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(24);
    expect(HELP_ARTICLE_MAP.has('quick-start')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('google-accounts')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('faq')).toBe(true);
  });

  it('resolves default and by id', () => {
    expect(getDefaultArticleId()).toBe('quick-start');
    expect(getHelpArticle('intro')?.title).toContain('NovelTrans');
    expect(getHelpArticle('missing-id')?.id).toBe('quick-start');
  });

  it('maps project info and source routes', () => {
    expect(helpArticleForRoute('/projects/abc-123/info')).toBe('project-info');
    expect(helpArticleForRoute('/projects/abc-123/source')).toBe('source-file-types');
  });

  it('searches book metadata topics', () => {
    const hits = searchHelpArticles('_BOOK_INFO');
    expect(hits.some((h) => h.article.id === 'book-info-file')).toBe(true);
    const prologue = searchHelpArticles('序章');
    expect(prologue.some((h) => h.article.id === 'prologue-preface')).toBe(true);
  });

  it('has book metadata help articles', () => {
    expect(HELP_ARTICLE_MAP.has('book-metadata-prep')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('book-info-file')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('prologue-preface')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('project-info')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('book-profile')).toBe(true);
    expect(HELP_ARTICLE_MAP.has('source-file-types')).toBe(true);
  });

  it('searches book profile and glossary terms', () => {
    const profile = searchHelpArticles('Book Profile');
    expect(profile.some((h) => h.article.id === 'book-profile')).toBe(true);
    const story = searchHelpArticles('story state');
    expect(story.length).toBeGreaterThan(0);
  });

  it('maps routes to context articles', () => {
    expect(helpArticleForRoute('/accounts')).toBe('google-accounts');
    expect(helpArticleForRoute('/translation')).toBe('start-translate');
    expect(helpArticleForRoute('/help/troubleshooting-quota')).toBe('troubleshooting-quota');
  });

  it('maps error codes to troubleshooting articles', () => {
    expect(helpArticleForErrorCode('LOGIN_REQUIRED')).toBe('troubleshooting-login');
    expect(helpArticleForErrorCode('QUOTA_LIMIT')).toBe('troubleshooting-quota');
  });

  it('searches Vietnamese keywords locally', () => {
    const hits = searchHelpArticles('đăng nhập');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.article.id.includes('google') || h.article.id.includes('login'))).toBe(
      true,
    );
  });

  it('searches missing paragraph topic', () => {
    const hits = searchHelpArticles('thiếu đoạn');
    expect(hits.some((h) => h.article.id === 'auto-qa' || h.article.id === 'troubleshooting-missing')).toBe(
      true,
    );
  });
});
