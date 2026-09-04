import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { AttentionInboxItemDto } from '@shared/schemas/attention-inbox';
import { ATTENTION_INBOX_PROACTIVE_TYPES } from '@shared/constants/attention-inbox';
import { resolveUiLocale } from '@shared/types/ui-locale';
import { Button, Card, SectionHeader } from '../../components/ui';
import { useLocaleStore, useT } from '../../i18n';

export interface AttentionInboxPanelProps {
  onOpenCountChange?: (count: number) => void;
  onNavigateLogin?: (accountId: string | null) => void;
  onOpenProject?: (projectId: string) => void;
  onChooseSource?: (projectId: string) => void;
  onSwitchProvider?: (accountId: string | null) => void;
  onOpenFolder?: (projectId: string) => void;
  onRefreshJobs?: () => void;
}

function titleFor(item: AttentionInboxItemDto, locale: string): string {
  return locale.startsWith('vi') ? item.titleVi : item.titleEn;
}

function descFor(item: AttentionInboxItemDto, locale: string): string {
  return locale.startsWith('vi') ? item.descriptionVi : item.descriptionEn;
}

function actionLabel(action: string, t: (key: string) => string): string {
  switch (action) {
    case 'OPEN_LOGIN':
      return t('attentionInbox.actions.openLogin');
    case 'RETRY':
      return t('attentionInbox.actions.retry');
    case 'CHOOSE_SOURCE':
      return t('attentionInbox.actions.chooseSource');
    case 'VIEW_ERROR':
      return t('attentionInbox.actions.viewError');
    case 'SWITCH_PROVIDER':
      return t('attentionInbox.actions.switchProvider');
    case 'SKIP':
      return t('attentionInbox.actions.skip');
    case 'OPEN_FOLDER':
      return t('attentionInbox.actions.openFolder');
    default:
      return action;
  }
}

export function AttentionInboxPanel({
  onOpenCountChange,
  onNavigateLogin,
  onOpenProject,
  onChooseSource,
  onSwitchProvider,
  onOpenFolder,
  onRefreshJobs,
}: AttentionInboxPanelProps) {
  const t = useT();
  const preference = useLocaleStore((s) => s.preference);
  const locale = useMemo(() => resolveUiLocale(preference), [preference]);
  const headingId = useId();
  const [items, setItems] = useState<AttentionInboxItemDto[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await window.khepreeNovelAI.attentionInbox.list();
      setItems(res.items);
      setOpenCount(res.openCount);
      onOpenCountChange?.(res.openCount);
    } catch {
      setItems([]);
      setOpenCount(0);
      onOpenCountChange?.(0);
    }
  }, [onOpenCountChange]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 8000);
    return () => { clearInterval(timer); };
  }, [refresh]);

  const runAct = async (
    itemId: string,
    action: string,
    snoozeMinutes?: number,
  ) => {
    setBusy(true);
    try {
      await window.khepreeNovelAI.attentionInbox.act({
        itemId,
        action: action as 'RETRY',
        snoozeMinutes,
      });
      if (action === 'RETRY') onRefreshJobs?.();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const bulkRetry = async () => {
    setBusy(true);
    try {
      await window.khepreeNovelAI.attentionInbox.bulkRetry({
        allRetryable: true,
      });
      onRefreshJobs?.();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && items[focusIndex]) {
      e.preventDefault();
      const item = items[focusIndex];
      void runAct(item.id, item.primaryAction);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-inbox-index="${focusIndex}"]`,
    );
    el?.focus();
  }, [focusIndex]);

  if (items.length === 0) return null;

  const retryableCount = items.filter(
    (i) => !ATTENTION_INBOX_PROACTIVE_TYPES.has(i.type),
  ).length;

  return (
    <section
      className="attention-inbox"
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
    >
      <SectionHeader
        id={headingId}
        title={t('attentionInbox.title')}
        description={t('attentionInbox.openCount', { n: String(openCount) })}
      />
      {retryableCount > 0 ? (
        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <Button size="sm" disabled={busy} onClick={() => void bulkRetry()}>
            {t('attentionInbox.bulkRetry', { n: String(retryableCount) })}
          </Button>
        </div>
      ) : null}
      <div className="jobs-card-list" ref={listRef} role="list">
        {items.map((item, index) => {
          const scopeJobs = item.affectedScope.jobIds.length;
          const scopeProjects = item.affectedScope.projectIds.length;
          return (
            <Card
              key={item.id}
              className="jobs-attention-card attention-inbox-card"
            >
              <div
                className={`jobs-card-row${focusIndex === index ? ' attention-inbox-card--focused' : ''}`}
                tabIndex={0}
                role="listitem"
                data-inbox-index={index}
                aria-label={titleFor(item, locale)}
                onFocus={() => { setFocusIndex(index); }}
              >
                <div className="jobs-card-main">
                  <strong>{titleFor(item, locale)}</strong>
                  <p className="muted jobs-card-sub">
                    {item.severity} · {item.type}
                    {item.projectId ? ` · ${item.projectId.slice(0, 8)}…` : ''}
                  </p>
                  <p className="jobs-card-message">{descFor(item, locale)}</p>
                  {scopeJobs > 1 || scopeProjects > 1 ? (
                    <p className="muted jobs-card-sub">
                      {t('attentionInbox.affectedScope', {
                        jobs: String(scopeJobs),
                        projects: String(Math.max(1, scopeProjects)),
                      })}
                    </p>
                  ) : null}
                  <details className="attention-inbox-tech">
                    <summary>{t('attentionInbox.techDetails')}</summary>
                    <pre className="attention-inbox-tech-body">
                      {item.techDetail || t('attentionInbox.noTechDetail')}
                      {item.causeCode ? `\ncause=${item.causeCode}` : ''}
                    </pre>
                  </details>
                </div>
                <div className="jobs-card-actions btn-row">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (item.primaryAction === 'OPEN_LOGIN') {
                        onNavigateLogin?.(item.accountId);
                      } else if (
                        item.primaryAction === 'VIEW_ERROR' &&
                        item.projectId
                      ) {
                        onOpenProject?.(item.projectId);
                      } else if (
                        item.primaryAction === 'CHOOSE_SOURCE' &&
                        item.projectId
                      ) {
                        onChooseSource?.(item.projectId);
                      } else if (item.primaryAction === 'SWITCH_PROVIDER') {
                        onSwitchProvider?.(item.accountId);
                      } else if (
                        item.primaryAction === 'OPEN_FOLDER' &&
                        item.projectId
                      ) {
                        onOpenFolder?.(item.projectId);
                      } else {
                        void runAct(item.id, item.primaryAction);
                      }
                    }}
                  >
                    {actionLabel(item.primaryAction, t)}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runAct(item.id, 'SNOOZE', 60)}
                  >
                    {t('attentionInbox.actions.snooze')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runAct(item.id, 'DISMISS')}
                  >
                    {t('attentionInbox.actions.dismiss')}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
