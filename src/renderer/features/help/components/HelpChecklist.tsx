import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, CheckCircle2, Circle } from 'lucide-react';
import { useT } from '../../../i18n';
import { Button } from '../../../components/ui';
import type { HelpArticle } from '../types';
import { HELP_ARTICLE_MAP } from '../content';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  actionLabel?: string;
  actionTo?: string;
}

interface HelpChecklistProps {
  items: ChecklistItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function HelpChecklist({ items, loading, error, onRetry }: HelpChecklistProps) {
  const t = useT();
  const navigate = useNavigate();

  if (loading) {
    return <p className="muted">{t('common.loading')}</p>;
  }

  if (error) {
    return (
      <div className="help-checklist-error">
        <p>{t('help.checklistError')}</p>
        <Button size="sm" onClick={onRetry}>{t('app.tryAgain')}</Button>
      </div>
    );
  }

  return (
    <ul className="help-checklist" aria-label={t('help.checklistTitle')}>
      {items.map((item) => (
        <li key={item.id} className={item.done ? 'help-checklist-item help-checklist-item--done' : 'help-checklist-item'}>
          {item.done ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
          <span>{item.label}</span>
          {!item.done && item.actionLabel && item.actionTo ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const to = item.actionTo;
                if (to) navigate(to);
              }}
            >
              {item.actionLabel}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function useHelpChecklist(): {
  items: ChecklistItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const tr = useT();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, projectsRes, setupRes, jobsRes] = await Promise.all([
        window.novelTrans.accounts.list(),
        window.novelTrans.projects.list(),
        window.novelTrans.setup.getStatus(),
        window.novelTrans.jobs.list(undefined),
      ]);

      const accounts = accountsRes.accounts;
      const hasAccount = accounts.length > 0;
      const geminiReady = accounts.some((a) => a.status === 'READY' && a.workerEnabled);
      const driveConnected = accounts.some((a) => a.driveConnected);
      const hasProject = projectsRes.projects.length > 0;
      const notebookReady = setupRes.notebookReadyCount > 0;
      const hasCompletedJob = jobsRes.jobs.some((j) => j.state === 'COMPLETED');

      setItems([
        {
          id: 'app',
          label: tr('help.check.appReady'),
          done: true,
        },
        {
          id: 'account',
          label: tr('help.check.hasAccount'),
          done: hasAccount,
          actionLabel: tr('help.check.actionAccount'),
          actionTo: '/accounts',
        },
        {
          id: 'gemini',
          label: tr('help.check.geminiReady'),
          done: geminiReady,
          actionLabel: tr('help.check.actionAccount'),
          actionTo: '/accounts',
        },
        {
          id: 'drive',
          label: tr('help.check.driveConnected'),
          done: driveConnected,
          actionLabel: tr('help.check.actionDrive'),
          actionTo: '/accounts',
        },
        {
          id: 'project',
          label: tr('help.check.hasProject'),
          done: hasProject,
          actionLabel: tr('help.check.actionProject'),
          actionTo: '/projects',
        },
        {
          id: 'notebook',
          label: tr('help.check.notebookReady'),
          done: notebookReady,
          actionLabel: tr('help.check.actionNotebook'),
          actionTo: '/translation',
        },
        {
          id: 'firstJob',
          label: tr('help.check.firstTranslation'),
          done: hasCompletedJob,
          actionLabel: tr('help.check.actionTranslate'),
          actionTo: '/translation',
        },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tr('help.checklistError'));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  const refresh = useCallback(() => {
    void loadChecklist();
  }, [loadChecklist]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}

export function HelpRelatedArticles({
  article,
  onOpen,
}: {
  article: HelpArticle;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const related = (article.relatedIds ?? [])
    .map((id) => HELP_ARTICLE_MAP.get(id))
    .filter(Boolean) as HelpArticle[];

  if (related.length === 0) return null;

  return (
    <section className="help-related">
      <h3>{t('help.relatedTitle')}</h3>
      <ul>
        {related.map((r) => (
          <li key={r.id}>
            <button type="button" className="help-link-btn" onClick={() => { onOpen(r.id); }}>
              {r.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HelpVersionFooter({ version }: { version: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copyInfo = async () => {
    const text = `NovelTrans Studio v${version}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => { setCopied(false); }, 2000);
    } catch {
      // ignore
    }
  };

  return (
    <footer className="help-version-footer">
      <p className="muted">{t('help.versionLine', { version })}</p>
      <Button size="sm" variant="ghost" onClick={() => void copyInfo()}>
        <Copy size={14} aria-hidden />
        {copied ? t('help.copied') : t('help.copyVersion')}
      </Button>
    </footer>
  );
}
