import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { JobDto } from '@shared/schemas/job';
import { measureJobProgress } from '@shared/utils/job-progress';
import { Button, Card, IconButton, ProgressBar, SectionHeader } from '../../components/ui';
import { DropdownMenu } from '../../components/overlay';
import { useT } from '../../i18n';
import {
  accountDisplayName,
  accountLaneStatus,
  findLaneJob,
  type WorkerRow,
} from './jobs-utils';

export interface AiAccountSectionProps {
  workers: WorkerRow[];
  accounts: GoogleAccountDto[];
  jobById: Map<string, JobDto>;
  jobs: JobDto[];
  titleFor: (projectId: string) => string;
  busy: boolean;
  onRunControl: (fn: () => Promise<{ message?: string } | undefined>) => void;
}

export function AiAccountSection({
  workers,
  accounts,
  jobById,
  jobs,
  titleFor,
  busy,
  onRunControl,
}: AiAccountSectionProps) {
  const t = useT();
  const navigate = useNavigate();

  const accountOrder = new Map(accounts.map((a, i) => [a.id, i]));
  const sorted = [...workers].sort((a, b) => {
    const ai = accountOrder.get(a.accountId) ?? 999;
    const bi = accountOrder.get(b.accountId) ?? 999;
    return ai - bi;
  });

  if (sorted.length === 0 && accounts.length === 0) {
    return (
      <section aria-labelledby="jobs-accounts-heading">
        <SectionHeader id="jobs-accounts-heading" title={t('jobs.aiAccounts')} />
        <Card className="jobs-account-card jobs-account-card--empty">
          <p className="muted" style={{ margin: 0 }}>
            {t('jobs.noWorkersHint')}
          </p>
          <Button
            size="sm"
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              navigate('/accounts');
            }}
          >
            {t('nav.accounts')}
          </Button>
        </Card>
      </section>
    );
  }

  const rows = sorted.length > 0 ? sorted : accounts.map((a) => ({
    id: a.id,
    accountId: a.id,
    health: a.status === 'BUSY' ? 'BUSY' : 'READY',
    priority: 100,
    currentJobId: null,
    limitedUntil: null,
    lastError: null,
  }));

  return (
    <section aria-labelledby="jobs-accounts-heading">
      <SectionHeader id="jobs-accounts-heading" title={t('jobs.aiAccounts')} />
      <div className="jobs-account-grid">
        {rows.map((worker) => {
          const account = accounts.find((a) => a.id === worker.accountId);
          const lane = accountLaneStatus(worker, account);
          const job = findLaneJob(worker, jobById, jobs);
          const displayIndex = accountOrder.get(worker.accountId) ?? 0;

          return (
            <AccountRow
              key={worker.id}
              worker={worker}
              account={account}
              lane={lane}
              job={job}
              displayName={accountDisplayName(
                account,
                displayIndex,
                t('jobs.accountFallback'),
              )}
              projectTitle={job ? titleFor(job.projectId) : null}
              busy={busy}
              onRunControl={onRunControl}
            />
          );
        })}
      </div>
    </section>
  );
}

function AccountRow({
  worker,
  account,
  lane,
  job,
  projectTitle,
  displayName,
  busy,
  onRunControl,
}: {
  worker: WorkerRow;
  account: GoogleAccountDto | undefined;
  lane: ReturnType<typeof accountLaneStatus>;
  job: JobDto | null;
  projectTitle: string | null;
  displayName: string;
  busy: boolean;
  onRunControl: (fn: () => Promise<{ message?: string } | undefined>) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const isRunning = lane === 'running';
  const activeJob = account?.availability?.activeJob;
  const measure = job ? measureJobProgress(job) : null;
  const progressHint =
    activeJob &&
    typeof activeJob.paragraphsDone === 'number' &&
    typeof activeJob.paragraphsTotal === 'number' &&
    activeJob.paragraphsTotal > 0
      ? t('jobs.paragraphsProgress', {
          done: String(activeJob.paragraphsDone),
          total: String(activeJob.paragraphsTotal),
        })
      : measure && measure.labelParts.length > 0
        ? measure.labelParts.join(' · ')
        : null;

  const statusText =
    lane === 'running' && projectTitle
      ? t('jobs.accountStatusRunning', { project: projectTitle })
      : t(`jobs.accountStatus.${lane}`);

  return (
    <Card className={`jobs-account-card jobs-account-card--${lane}`}>
      <div className="jobs-card-row">
        <div className="jobs-card-main">
          <strong>{displayName}</strong>
          <p className={`jobs-account-status jobs-account-status--${lane}`}>
            <span className="jobs-summary-icon" aria-hidden>
              {lane === 'attention' || lane === 'login' ? '⚠' : lane === 'paused' ? '○' : '●'}
            </span>
            <span>{statusText}</span>
          </p>
          {progressHint ? (
            <>
              <p className="muted jobs-card-sub">{progressHint}</p>
              <ProgressBar
                value={measure?.percent ?? null}
                indeterminate={measure?.indeterminate ?? true}
                label={progressHint}
                aria-label={t('jobs.progressAria', {
                  project: projectTitle ?? displayName,
                  percent: String(measure?.percent ?? 0),
                })}
              />
            </>
          ) : null}
          {worker.lastError && (lane === 'attention' || lane === 'login') ? (
            <p className="muted u-text-sm" style={{ margin: '0.35rem 0 0' }}>
              {worker.lastError}
            </p>
          ) : null}
        </div>
        <div className="jobs-card-actions btn-row">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void onRunControl(async () => {
                await window.novelTrans.accounts.openBrowser(worker.accountId, 'gemini');
                return { message: t('jobs.openedGemini') };
              })
            }
          >
            {t('jobs.openGemini')}
          </Button>
          {lane === 'paused' || account?.workerEnabled === false ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void onRunControl(async () => {
                  await window.novelTrans.accounts.enable(worker.accountId);
                  return { message: t('jobs.workerResumed') };
                })
              }
            >
              {t('actions.resume')}
            </Button>
          ) : isRunning ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              title={t('jobs.pauseWorkerAfterCurrentHint')}
              onClick={() =>
                void onRunControl(async () => {
                  await window.novelTrans.accounts.disable(worker.accountId);
                  return { message: t('jobs.workerPauseAfterCurrent') };
                })
              }
            >
              {t('jobs.pauseWorkerAfterCurrent')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void onRunControl(async () => {
                  await window.novelTrans.accounts.disable(worker.accountId);
                  return { message: t('jobs.workerPaused') };
                })
              }
            >
              {t('jobs.pauseWorker')}
            </Button>
          )}
          <IconButton
            ref={menuRef}
            label={t('jobs.moreActions')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal size={18} aria-hidden />
          </IconButton>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            anchorRef={menuRef}
            className="translation-menu"
            placement="bottom-end"
            minWidth={220}
          >
            {lane === 'paused' || account?.workerEnabled === false ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onRunControl(async () => {
                    await window.novelTrans.accounts.enable(worker.accountId);
                    return { message: t('jobs.workerResumed') };
                  });
                }}
              >
                {t('actions.resume')}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onRunControl(async () => {
                    await window.novelTrans.accounts.disable(worker.accountId);
                    return {
                      message: isRunning
                        ? t('jobs.workerPauseAfterCurrent')
                        : t('jobs.workerPaused'),
                    };
                  });
                }}
              >
                {isRunning ? t('jobs.pauseWorkerAfterCurrent') : t('jobs.pauseWorker')}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void onRunControl(async () => {
                  await window.novelTrans.accounts.testSession(worker.accountId);
                  return { message: t('jobs.sessionChecked') };
                });
              }}
            >
              {t('jobs.checkConnection')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate('/accounts');
              }}
            >
              {t('jobs.openAccount')}
            </button>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
