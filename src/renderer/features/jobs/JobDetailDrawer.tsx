import type { JobAttemptDto, JobDto } from '@shared/schemas/job';
import type { GoogleAccountDto } from '@shared/schemas/account';
import { measureJobProgress } from '@shared/utils/job-progress';
import { Button, Drawer, ProgressBar, Select } from '../../components/ui';
import { useT } from '../../i18n';
import { friendlyError } from '../../i18n/errors';
import { statusLabel } from '../../i18n/status';
import {
  accountDisplayName,
  chapterRange,
  friendlyChannel,
  friendlyJobSummary,
  jobSupportsPartialResume,
  knowledgeLabel,
  paragraphProgressLabel,
  priorityBand,
  type PriorityBand,
} from './jobs-utils';
import { formatAttemptProviderChain, jobProviderLabel } from './job-provider-ui';

export interface JobDetailDrawerProps {
  open: boolean;
  job: JobDto | null;
  attempts: JobAttemptDto[];
  titleFor: (projectId: string) => string;
  accountById: Map<string, GoogleAccountDto>;
  accountOrder: Map<string, number>;
  showAdvanced: boolean;
  busy: boolean;
  onClose: () => void;
  onToggleAdvanced: () => void;
  onSetPriority: (jobId: string, band: PriorityBand) => void;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onOpenGemini: (accountId: string) => void;
}

export function JobDetailDrawer({
  open,
  job,
  attempts,
  titleFor,
  accountById,
  accountOrder,
  showAdvanced,
  busy,
  onClose,
  onToggleAdvanced,
  onSetPriority,
  onRetry,
  onCancel,
  onOpenGemini,
}: JobDetailDrawerProps) {
  const t = useT();

  if (!job) return null;

  const range = chapterRange(job);
  const measure = measureJobProgress(job);
  const accountId = job.progress?.accountId ?? job.pinnedAccountId;
  const account = accountId ? accountById.get(accountId) : undefined;
  const provider = jobProviderLabel(job);
  const attemptChain = formatAttemptProviderChain(attempts, t);
  const errInfo = job.error ? friendlyError(job.error) : null;
  const partial = jobSupportsPartialResume(job);
  const started = job.startedAt
    ? new Date(job.startedAt).toLocaleString('vi-VN')
    : null;
  const completed = job.completedAt
    ? new Date(job.completedAt).toLocaleString('vi-VN')
    : null;

  return (
    <Drawer open={open} title={titleFor(job.projectId)} onClose={onClose} closeLabel={t('actions.close')}>
      <div className="jobs-detail">
        <dl className="jobs-detail-list">
          <div>
            <dt>{t('jobs.project')}</dt>
            <dd>{titleFor(job.projectId)}</dd>
          </div>
          {range ? (
            <div>
              <dt>{t('jobs.chapters')}</dt>
              <dd>{t('jobs.chapterLabel', { range })}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('jobs.status')}</dt>
            <dd>{statusLabel(job.state)}</dd>
          </div>
          <div>
            <dt>{t('jobs.progress')}</dt>
            <dd>
              <ProgressBar
                value={measure.percent}
                indeterminate={measure.indeterminate}
                label={paragraphProgressLabel(job) ?? undefined}
              />
            </dd>
          </div>
          {started ? (
            <div>
              <dt>{t('jobs.started')}</dt>
              <dd>{started}</dd>
            </div>
          ) : null}
          {completed ? (
            <div>
              <dt>{t('jobs.completed')}</dt>
              <dd>{completed}</dd>
            </div>
          ) : null}
          {errInfo ? (
            <div>
              <dt>{t('jobs.errorAction')}</dt>
              <dd>
                <p className="jobs-card-message">{friendlyJobSummary(job, t)}</p>
              </dd>
            </div>
          ) : null}
          {provider ? (
            <div>
              <dt>{t('jobs.aiAccount')}</dt>
              <dd>
                {account
                  ? t('jobs.aiLine', {
                      provider,
                      account: accountDisplayName(
                        account,
                        accountOrder.get(account.id) ?? 0,
                        t('jobs.accountFallback'),
                      ),
                    })
                  : t('jobs.aiProviderOnly', { provider })}
              </dd>
            </div>
          ) : null}
          {attemptChain.length > 0 ? (
            <div>
              <dt>{t('jobs.attemptChainTitle')}</dt>
              <dd>
                <ul className="jobs-attempt-chain">
                  {attemptChain.map((row, index) => (
                    <li key={`${row.provider}-${index}`}>
                      {index > 0 ? <span aria-hidden>↓ </span> : null}
                      {row.provider} · {row.state}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t('jobs.priority')}</dt>
            <dd>
              <Select
                value={priorityBand(job.priority)}
                disabled={busy}
                aria-label={t('jobs.priority')}
                title={t('jobs.priorityTooltip')}
                onChange={(e) => {
                  onSetPriority(job.id, e.target.value as PriorityBand);
                }}
              >
                <option value="high">{t('jobs.priorityHigh')}</option>
                <option value="normal">{t('jobs.priorityNormal')}</option>
                <option value="low">{t('jobs.priorityLow')}</option>
              </Select>
            </dd>
          </div>
        </dl>

        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          {(job.state === 'FAILED' ||
            job.state === 'NEEDS_ATTENTION' ||
            job.state === 'CANCELLED') && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void onRetry(job.id);
              }}
            >
              {partial ? t('jobs.continueFromError') : t('actions.retry')}
            </Button>
          )}
          {accountId ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void onOpenGemini(accountId);
              }}
            >
              {t('jobs.openGemini')}
            </Button>
          ) : null}
          {job.state !== 'CANCELLED' &&
          job.state !== 'COMPLETED' &&
          job.state !== 'ACCEPTED_WITH_WARNINGS' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onCancel(job.id);
              }}
            >
              {t('actions.cancel')}
            </Button>
          ) : null}
        </div>

        <button type="button" className="ops-advanced-toggle" onClick={onToggleAdvanced}>
          {showAdvanced ? t('jobs.hideAdvanced') : t('jobs.showAdvanced')}
        </button>
        {showAdvanced ? (
          <div className="ops-advanced muted">
            <p>Job ID: {job.id}</p>
            <p>
              {t('jobs.account')}:{' '}
              {account
                ? accountDisplayName(
                    account,
                    accountOrder.get(account.id) ?? 0,
                    t('jobs.accountFallback'),
                  )
                : (accountId ?? '—')}
            </p>
            {accountId ? <p>Account ID: {accountId}</p> : null}
            {job.progress?.providerType ? (
              <p>provider: {job.progress.providerType}</p>
            ) : null}
            {job.progress?.packMode ? <p>packMode: {job.progress.packMode}</p> : null}
            {knowledgeLabel(job) ? <p>{knowledgeLabel(job)}</p> : null}
            <p>
              {t('jobs.status')}: {job.state} · attempts {job.attemptCount}
            </p>
            {friendlyChannel(job) ? <p>channel: {friendlyChannel(job)}</p> : null}
            {job.error ? <p className="error-text">{job.error}</p> : null}
            {attempts.length > 0 ? (
              <ul style={{ paddingLeft: '1.1rem' }}>
                {attempts.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    #{a.attemptNumber} {a.state}
                    {a.error ? ` — ${a.error.slice(0, 80)}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
