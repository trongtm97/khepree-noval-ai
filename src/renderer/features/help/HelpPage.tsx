import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GetInfoResponse } from '@shared/schemas/ipc';
import { useT } from '../../i18n';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  getDefaultArticleId,
  getHelpArticle,
} from './content';
import { HelpArticleBody } from './components/HelpArticle';
import { HelpChecklist, HelpRelatedArticles, HelpVersionFooter, useHelpChecklist } from './components/HelpChecklist';
import { HelpSearch, HelpSidebar } from './components/HelpSearch';
import { Button } from '../../components/ui';
import { useState } from 'react';
import { useFeatureIntroUiStore } from '../feature-intro/feature-intro-store';

interface HelpPageProps {
  appInfo: GetInfoResponse;
}

export function HelpPage({ appInfo }: HelpPageProps) {
  const t = useT();
  const navigate = useNavigate();
  const { articleId } = useParams<{ articleId?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLElement>(null);

  const activeId = articleId && getHelpArticle(articleId) ? articleId : getDefaultArticleId();
  const article = getHelpArticle(activeId);

  const categories = useMemo(() => {
    return HELP_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: cat.label,
      articles: HELP_ARTICLES.filter((a) => a.categoryId === cat.id),
    })).filter((c) => c.articles.length > 0);
  }, []);

  const checklist = useHelpChecklist();
  const requestTour = useFeatureIntroUiStore((s) => s.requestTour);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeId]);

  const openArticle = (id: string) => {
    navigate(`/help/${id}`);
  };

  const categoryLabel = article
    ? HELP_CATEGORIES.find((c) => c.id === article.categoryId)?.label
    : '';

  if (!article) {
    return (
      <div className="help-page">
        <p>{t('help.loadError')}</p>
        <button type="button" className="btn-primary" onClick={() => { navigate('/help'); }}>
          {t('app.tryAgain')}
        </button>
      </div>
    );
  }

  const showChecklist = activeId === 'quick-start' || activeId === 'intro';

  return (
    <div className="help-page">
      <header className="help-header">
        <div>
          <h1 className="help-page-title">{t('help.title')}</h1>
          <p className="muted help-page-subtitle">{t('help.subtitle')}</p>
          <div className="help-header-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                openArticle('contact');
              }}
            >
              {t('help.contactCta')}
            </Button>
          </div>
        </div>
        <HelpSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSelect={(a) => { openArticle(a.id); }}
        />
      </header>

      <div className="help-layout">
        <HelpSidebar
          categories={categories}
          activeId={activeId}
          onSelect={openArticle}
        />

        <main className="help-content" ref={contentRef}>
          <nav className="help-breadcrumb muted" aria-label="Breadcrumb">
            <button type="button" className="help-link-btn" onClick={() => { openArticle(getDefaultArticleId()); }}>
              {t('help.title')}
            </button>
            {categoryLabel ? (
              <>
                <span aria-hidden> / </span>
                <span>{categoryLabel}</span>
              </>
            ) : null}
            <span aria-hidden> / </span>
            <span>{article.title}</span>
          </nav>

          <h2 className="help-article-title">{article.title}</h2>
          <p className="help-article-desc muted">{article.description}</p>

          {showChecklist ? (
            <section className="help-checklist-section">
              <h3>{t('help.checklistTitle')}</h3>
              <HelpChecklist
                items={checklist.items}
                loading={checklist.loading}
                error={checklist.error}
                onRetry={checklist.refresh}
              />
            </section>
          ) : null}

          <HelpArticleBody
            blocks={article.blocks}
            onNavigate={(to) => { navigate(to); }}
            onOpenArticle={openArticle}
            searchQuery={searchQuery}
          />

          {activeId === 'production-tour' ? (
            <div className="help-actions btn-row">
              <Button
                onClick={() => {
                  requestTour();
                  navigate('/');
                }}
              >
                {t('help.restartProductionTour')}
              </Button>
            </div>
          ) : null}

          <HelpRelatedArticles article={article} onOpen={openArticle} />
          <HelpVersionFooter
            version={appInfo.version}
            onOpenContact={() => {
              openArticle('contact');
            }}
          />
        </main>
      </div>
    </div>
  );
}
