import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import type { JobAttemptDto, JobDto } from '@shared/schemas/job';
import { useT } from '../i18n';
import { statusLabel } from '../i18n/status';
import { friendlyError } from '../i18n/errors';
import {
  formatJobAttemptDetail,
  formatJobAttemptHeadline,
} from '../utils/job-attempt-summary';
import { helpArticleForErrorCode } from '../features/help/content';
import {
  PageHeader,
  Button,
  Card,
  Tabs,
  TabPanel,
  EmptyState,
  LogViewer,
  SearchInput,
  Select,
  ErrorPanel,
  Skeleton,
  type LogLine,
} from '../components/ui';
import { HelpContextButton } from '../features/help/HelpContextButton';
import { OperationalExportDialog } from '../components/OperationalExportDialog';

type LogsTab = 'activity' | 'technical';

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function attemptLevel(attempt: JobAttemptDto): string {
  const state = attempt.state.toUpperCase();
  if (state.includes('FAIL') || attempt.error) return 'error';
  if (state.includes('WARN') || state.includes('ATTENTION')) return 'warn';
  return 'info';
}

export function LogsPage() {
  const t = useT();
  const [tab, setTab] = useState<LogsTab>('activity');
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [activityLines, setActivityLines] = useState<LogLine[]>([]);
  const [technicalLines, setTechnicalLines] = useState<LogLine[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    const listed = await window.novelTrans.jobs.list(undefined);
    setJobs(listed.jobs);
    const recent = listed.jobs.slice(0, 40);
    const details = await Promise.all(
      recent.map((job) =>
        window.novelTrans.jobs.get(job.id).catch(() => ({ job, attempts: [] as JobAttemptDto[] })),
      ),
    );
    const lines: LogLine[] = [];
    for (const detail of details) {
      const job = detail.job;
      const chapterLabel =
        job.chapterFrom != null && job.chapterTo != null
          ? `${job.chapterFrom}–${job.chapterTo}`
          : job.type;
      if (detail.attempts.length === 0) {
        lines.push({
          id: `${job.id}-job`,
          time: formatTime(job.updatedAt),
          level: job.state === 'FAILED' ? 'error' : 'info',
          message: `${job.id.slice(0, 8)} · ${chapterLabel} · ${statusLabel(job.state)}`,
        });
        continue;
      }
      for (const attempt of detail.attempts) {
        const headline = `${job.id.slice(0, 8)} · ${chapterLabel} · ${formatJobAttemptHeadline(attempt)}`;
        const detailText = formatJobAttemptDetail(attempt);
        lines.push({
          id: attempt.id,
          time: formatTime(attempt.completedAt ?? attempt.startedAt ?? job.updatedAt),
          level: attemptLevel(attempt),
          message: detailText ? `${headline} — ${detailText}` : headline,
        });
      }
    }
    lines.sort((a, b) => b.time.localeCompare(a.time));
    setActivityLines(lines);
  }, []);

  const loadTechnical = useCallback(async () => {
    const result = await window.novelTrans.logs.tail({
      maxLines: 500,
      level: levelFilter === 'all' ? 'all' : (levelFilter as 'info' | 'warn' | 'error'),
    });
    const mapped: LogLine[] = result.lines.map((line) => ({
      id: line.id,
      time: formatTime(line.timestamp),
      level: line.level,
      message: line.module ? `[${line.module}] ${line.message}` : line.message,
    }));
    setTechnicalLines(mapped);
  }, [levelFilter]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadActivity();
        await loadTechnical();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadActivity, loadTechnical, t]);

  const filteredActivity = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activityLines.filter((line) => {
      if (levelFilter !== 'all' && line.level.toLowerCase() !== levelFilter) return false;
      if (!q) return true;
      return line.message.toLowerCase().includes(q) || line.time.toLowerCase().includes(q);
    });
  }, [activityLines, search, levelFilter]);

  const filteredTechnical = useMemo(() => {
    const q = search.trim().toLowerCase();
    return technicalLines.filter((line) => {
      if (!q) return true;
      return line.message.toLowerCase().includes(q) || line.time.toLowerCase().includes(q);
    });
  }, [technicalLines, search]);

  const errInfo = error ? friendlyError(error) : null;

  if (loading) {
    return (
      <div>
        <PageHeader title={t('logs.title')} description={t('logs.subtitle')} />
        <Skeleton height={320} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('logs.title')}
        description={t('logs.subtitle')}
        actions={
          <div className="btn-row">
            <HelpContextButton articleId="logs" />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(
                  (tab === 'activity' ? filteredActivity : filteredTechnical)
                    .map((l) => `${l.time}\t${l.level}\t${l.message}`)
                    .join('\n'),
                );
              }}
            >
              {t('actions.copy')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void window.novelTrans.logs.openDir();
              }}
            >
              <FolderOpen size={16} aria-hidden />
              {t('actions.openLogFolder')}
            </Button>
          </div>
        }
      />

      <Card style={{ marginBottom: '1rem' }}>
        <h3>{t('operationalExport.sectionTitle')}</h3>
        <OperationalExportDialog
          kinds={['operational_activity', 'operational_workbook']}
        />
      </Card>

      <Tabs
        items={[
          { id: 'activity', label: t('logs.activity') },
          { id: 'technical', label: t('logs.technical') },
        ]}
        value={tab}
        onChange={(id) => {
          setTab(id as LogsTab);
        }}
      />

      <div className="btn-row" style={{ margin: '0.75rem 0', flexWrap: 'wrap' }}>
        <SearchInput
          placeholder={t('logs.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <Select
          value={levelFilter}
          aria-label={t('logs.filterLevel')}
          onChange={(e) => {
            setLevelFilter(e.target.value);
          }}
        >
          <option value="all">{t('logs.all')}</option>
          <option value="info">{t('logs.info')}</option>
          <option value="warn">{t('logs.warn')}</option>
          <option value="error">{t('logs.error')}</option>
        </Select>
        <span className="muted">
          {jobs.length > 0 ? `${jobs.length} ${t('nav.jobs').toLowerCase()}` : null}
        </span>
      </div>

      {errInfo ? (
        <ErrorPanel
          title={errInfo.title}
          description={errInfo.description}
          technical={errInfo.technical}
          helpArticleId={helpArticleForErrorCode(errInfo.code)}
        />
      ) : null}

      <TabPanel active={tab === 'activity'}>
        {filteredActivity.length === 0 ? (
          <EmptyState icon={<FileText />} title={t('logs.emptyActivity')} />
        ) : (
          <div style={{ height: 'min(60vh, 560px)' }}>
            <LogViewer lines={filteredActivity} />
          </div>
        )}
      </TabPanel>

      <TabPanel active={tab === 'technical'}>
        {filteredTechnical.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={t('logs.emptyTechnical')}
            actionLabel={t('actions.openLogFolder')}
            onAction={() => {
              void window.novelTrans.logs.openDir();
            }}
          />
        ) : (
          <div style={{ height: 'min(60vh, 560px)' }}>
            <LogViewer lines={filteredTechnical} />
          </div>
        )}
      </TabPanel>
    </div>
  );
}
