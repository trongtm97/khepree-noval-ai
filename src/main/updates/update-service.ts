import { KHEPREE_PRODUCT_SLUG } from '@shared/constants/khepree';
import { sanitizeIpcErrorMessage, sanitizeUrlForLog } from '../security/log-sanitize';
import { logger } from '../logging/logger';
import { getKhepreeOAuthClientId } from '../khepree/config';
import {
  getDesktopAppVersion,
  getDesktopArchitecture,
  getDesktopReleaseChannel,
  getDesktopReleasePlatform,
} from '../khepree/desktop-runtime-context';
import type { UpdateStatus, UpdateStatusPhase } from '@shared/schemas/updates';
import type {
  AccessTokenProvider,
  AutoUpdaterPort,
  JobsRunningProbe,
  LocaleProvider,
  UpdateApiPort,
  UpdateEventSink,
} from './update-ports';

const STARTUP_DELAY_MS = 10_000;
const SCHEDULED_CHECK_MS = 6 * 60 * 60 * 1000;

function isSquirrelFirstRun(): boolean {
  return process.argv.some((arg) => arg.includes('--squirrel-firstrun'));
}

function redactUpdateError(error: Error): string {
  return sanitizeIpcErrorMessage(error.message.replace(/ft=[^&\s]+/gi, 'ft=[redacted]'));
}

function sanitizeReleaseNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  return notes
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .slice(0, 8000);
}

export class UpdateService {
  private phase: UpdateStatusPhase = 'idle';
  private latestVersion: string | null = null;
  private releaseNotes: string | null = null;
  private mandatoryUpdate = false;
  private manualDownloadUrl: string | null = null;
  private lastCheckedAt: string | null = null;
  private downloadProgress: number | null = null;
  private errorMessage: string | null = null;
  private postponedUntil: number | null = null;
  private checkInFlight: Promise<void> | null = null;
  private scheduledTimer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private listenersBound = false;

  constructor(
    private readonly autoUpdater: AutoUpdaterPort,
    private readonly api: UpdateApiPort,
    private readonly getAccessToken: AccessTokenProvider,
    private readonly getLocale: LocaleProvider,
    private readonly getJobsRunning: JobsRunningProbe,
    private readonly emitStatus: UpdateEventSink,
    private readonly packaged: boolean,
  ) {}

  initialize(): void {
    if (!this.listenersBound) {
      this.bindAutoUpdaterEvents();
      this.listenersBound = true;
    }
    this.scheduleStartupCheck();
    this.scheduledTimer = setInterval(() => {
      void this.checkNow('scheduled');
    }, SCHEDULED_CHECK_MS);
  }

  shutdown(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.scheduledTimer) clearInterval(this.scheduledTimer);
    this.autoUpdater.removeAllListeners();
    this.listenersBound = false;
  }

  onResume(): void {
    void this.checkNow('resume');
  }

  getStatus(): UpdateStatus {
    const jobsRunning = this.getJobsRunning();
    const canCheck = !this.checkInFlight && !['checking', 'downloading', 'installing'].includes(this.phase);
    return {
      phase: this.phase,
      currentVersion: getDesktopAppVersion(),
      latestVersion: this.latestVersion,
      releaseChannel: getDesktopReleaseChannel(),
      lastCheckedAt: this.lastCheckedAt,
      mandatoryUpdate: this.mandatoryUpdate,
      releaseNotes: this.releaseNotes,
      downloadProgress: this.downloadProgress,
      errorMessage: this.errorMessage,
      manualDownloadUrl: this.manualDownloadUrl,
      canInstall: this.phase === 'downloaded' && jobsRunning === 0,
      canCheck,
      jobsRunning,
      postponedUntil:
        this.postponedUntil != null ? new Date(this.postponedUntil).toISOString() : null,
    };
  }

  /** Single-flight manual or scheduled check. */
  async checkNow(source: string): Promise<UpdateStatus> {
    if (this.postponedUntil != null && Date.now() < this.postponedUntil) {
      return this.getStatus();
    }
    if (this.checkInFlight) {
      await this.checkInFlight;
      return this.getStatus();
    }
    this.checkInFlight = this.runCheck(source).finally(() => {
      this.checkInFlight = null;
    });
    await this.checkInFlight;
    return this.getStatus();
  }

  postpone(untilMs?: number): UpdateStatus {
    const delay = untilMs ?? 24 * 60 * 60 * 1000;
    this.postponedUntil = Date.now() + delay;
    this.publishStatus();
    return this.getStatus();
  }

  async installAndRestart(): Promise<{ ok: boolean; reason?: string }> {
    await Promise.resolve();
    if (this.phase !== 'downloaded') {
      return { ok: false, reason: 'not_downloaded' };
    }
    const jobsRunning = this.getJobsRunning();
    if (jobsRunning > 0) {
      return { ok: false, reason: 'jobs_running' };
    }
    this.phase = 'installing';
    this.publishStatus();
    this.autoUpdater.quitAndInstall();
    return { ok: true };
  }

  handleBeforeQuitForUpdate(): void {
    logger.info('Preparing for update install — flushing resources');
  }

  private scheduleStartupCheck(): void {
    if (isSquirrelFirstRun()) {
      logger.info('Skipping immediate update check — squirrel first run');
    }
    const delay = isSquirrelFirstRun() ? STARTUP_DELAY_MS : STARTUP_DELAY_MS;
    this.startupTimer = setTimeout(() => {
      void this.checkNow('startup');
    }, delay);
  }

  private bindAutoUpdaterEvents(): void {
    this.autoUpdater.on('checking-for-update', () => {
      this.phase = 'checking';
      this.errorMessage = null;
      this.publishStatus();
    });

    this.autoUpdater.on('update-available', (info) => {
      this.phase = 'downloading';
      this.latestVersion = info.version ?? this.latestVersion;
      this.releaseNotes = sanitizeReleaseNotes(info.releaseNotes ?? this.releaseNotes);
      this.downloadProgress = 0;
      this.publishStatus();
    });

    this.autoUpdater.on('update-not-available', () => {
      this.phase = 'up-to-date';
      this.downloadProgress = null;
      this.publishStatus();
    });

    this.autoUpdater.on('download-progress', (progress) => {
      this.phase = 'downloading';
      this.downloadProgress =
        typeof progress.percent === 'number'
          ? Math.max(0, Math.min(100, Math.round(progress.percent)))
          : this.downloadProgress;
      this.publishStatus();
    });

    this.autoUpdater.on('update-downloaded', (info) => {
      this.phase = 'downloaded';
      this.latestVersion = info.version ?? this.latestVersion;
      this.releaseNotes = sanitizeReleaseNotes(info.releaseNotes ?? this.releaseNotes);
      this.downloadProgress = 100;
      this.publishStatus();
    });

    this.autoUpdater.on('error', (error) => {
      this.phase = 'error';
      this.errorMessage = redactUpdateError(error);
      this.downloadProgress = null;
      logger.warn('AutoUpdater error', { message: this.errorMessage });
      this.publishStatus();
    });
  }

  private async runCheck(source: string): Promise<void> {
    if (!this.packaged) {
      this.phase = 'unavailable';
      this.errorMessage = null;
      this.lastCheckedAt = new Date().toISOString();
      this.publishStatus();
      return;
    }

    if (process.platform !== 'win32') {
      this.phase = 'unavailable';
      this.lastCheckedAt = new Date().toISOString();
      this.publishStatus();
      return;
    }

    this.phase = 'checking';
    this.errorMessage = null;
    this.publishStatus();

    try {
      const token = await this.getAccessToken();
      if (!token) {
        this.phase = 'unavailable';
        this.lastCheckedAt = new Date().toISOString();
        this.publishStatus();
        return;
      }

      const clientId = getKhepreeOAuthClientId();
      const locale = this.getLocale();
      const platform = getDesktopReleasePlatform();
      const architecture = getDesktopArchitecture();
      const channel = getDesktopReleaseChannel();
      const currentVersion = getDesktopAppVersion();

      const latest = await this.api.fetchLatestUpdate({
        accessToken: token,
        clientId,
        currentVersion,
        platform,
        architecture,
        channel,
        locale,
      });

      this.lastCheckedAt = new Date().toISOString();
      this.mandatoryUpdate = latest.update?.mandatoryUpdate ?? false;
      this.releaseNotes = sanitizeReleaseNotes(latest.update?.releaseNotes ?? null);
      this.latestVersion = latest.update?.version ?? null;
      this.manualDownloadUrl = this.buildManualDownloadUrl(latest.update?.version ?? null);

      if (!latest.update || latest.update.version === currentVersion) {
        this.phase = 'up-to-date';
        this.publishStatus();
        return;
      }

      const ticket = await this.api.requestSquirrelFeedTicket({
        accessToken: token,
        clientId,
        architecture: architecture === 'universal' ? 'x64' : architecture,
        channel,
      });

      logger.info('Configured Squirrel feed for update check', {
        source,
        product: KHEPREE_PRODUCT_SLUG,
        feed: sanitizeUrlForLog(ticket.feedBaseUrl),
      });

      this.autoUpdater.setFeedURL({ url: ticket.feedBaseUrl });
      this.autoUpdater.checkForUpdates();
    } catch (error) {
      this.phase = 'error';
      this.errorMessage = redactUpdateError(
        error instanceof Error ? error : new Error(String(error)),
      );
      this.lastCheckedAt = new Date().toISOString();
      logger.warn('Update check failed', { source, message: this.errorMessage });
      this.publishStatus();
    }
  }

  private buildManualDownloadUrl(version: string | null): string | null {
    if (!version) return null;
    return `https://khepree.com/products/khepree-novel-ai/releases/${encodeURIComponent(version)}`;
  }

  private publishStatus(): void {
    this.emitStatus(this.getStatus());
  }
}
