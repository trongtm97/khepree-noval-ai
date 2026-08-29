import { newId } from '../db/utils/uuid';
import { nextSequentialDisplayName } from '@shared/utils/account-display-name';
import type { GoogleAccountRepository, GoogleAccountDetail } from '../db/repositories/google-account-repository';
import type { AuditLogService } from '../security/audit-log-service';
import type { SecretStorageService } from '../security/secret-storage-service';
import type {
  GoogleAccountPlan,
  GoogleAccountStatus,
} from '@shared/constants/google-account';
import {
  browserProfileManager,
  type BrowserProfileManager,
} from '../automation/browser-runner/profile-manager';
import {
  ProfileBusyError,
  profileLockManager,
  startLeaseHeartbeat,
  type ProfileLeaseLockManager,
} from '../automation/browser-runner/profile-lock';
import type {
  BrowserSessionController,
  BrowserSessionHandle,
  GeminiSessionCookies,
} from '../automation/browser-runner/browser-session-controller';
import { PlaywrightBrowserSessionController } from '../automation/browser-runner/browser-session-controller';
import { logger } from '../logging/logger';

const GEMINI_URL = 'https://gemini.google.com/app';
const NOTEBOOK_URL = 'https://notebook.google.com/';

export interface AccountWorkerServiceDeps {
  accounts: GoogleAccountRepository;
  auditLog: AuditLogService;
  secretStorage: SecretStorageService;
  profiles?: BrowserProfileManager;
  locks?: ProfileLeaseLockManager;
  browser?: BrowserSessionController;
}

export class AccountWorkerService {
  private readonly accounts: GoogleAccountRepository;
  private readonly auditLog: AuditLogService;
  private readonly profiles: BrowserProfileManager;
  private readonly locks: ProfileLeaseLockManager;
  private readonly browser: BrowserSessionController;
  private readonly openSessions = new Map<string, BrowserSessionHandle>();
  private readonly leaseHeartbeats = new Map<string, () => void>();

  constructor(deps: AccountWorkerServiceDeps) {
    this.accounts = deps.accounts;
    this.auditLog = deps.auditLog;
    this.profiles = deps.profiles ?? browserProfileManager;
    this.locks = deps.locks ?? profileLockManager;
    this.browser = deps.browser ?? new PlaywrightBrowserSessionController();
  }

  listAccounts(): GoogleAccountDetail[] {
    return this.accounts.listDetails();
  }

  getAccount(id: string): GoogleAccountDetail | null {
    return this.accounts.getDetail(id);
  }

  /**
   * Add Google Account flow:
   * 1. worker UUID  2. dedicated profile dir  3. open browser
   * 4. navigate Gemini  5. user logs in manually
   * 6. probe session  7. persist  8–9. no password / no CAPTCHA bypass
   */
  async addAccount(input?: {
    label?: string;
    email?: string | null;
    skipBrowser?: boolean;
  }): Promise<GoogleAccountDetail> {
    const workerId = newId();
    const { profileDirName } = this.profiles.createProfileDirectory(workerId);
    const existingCount = this.accounts.list().length;
    const label =
      input?.label?.trim() ||
      nextSequentialDisplayName('Tài khoản Google', existingCount);

    const account = this.accounts.create({
      id: workerId,
      label,
      email: input?.email ?? null,
      displayName: label,
      profileDirName,
      status: 'NEW',
      plan: 'UNKNOWN',
    });

    this.auditLog.accountAdded(account.id, label);

    if (input?.skipBrowser) {
      this.accounts.update(account.id, { status: 'LOGIN_REQUIRED' });
      return this.assertDetail(account.id);
    }

    try {
      await this.openBrowserSession(account.id, GEMINI_URL);
      this.accounts.update(account.id, { status: 'LOGIN_REQUIRED' });
    } catch (error) {
      logger.error('Failed to open browser for new account', {
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.accounts.update(account.id, { status: 'NEEDS_ATTENTION' });
    }

    return this.assertDetail(account.id);
  }

  async completeLogin(accountId: string, fallback?: { email?: string; label?: string }): Promise<GoogleAccountDetail> {
    const account = this.requireAccount(accountId);
    const handle = this.openSessions.get(accountId);

    let probe;
    let cookies: GeminiSessionCookies | null = null;
    try {
      if (handle?.isOpen()) {
        probe = await handle.probeSession();
        cookies = await this.tryExtractGeminiCookies(handle);
      } else {
        const result = await this.withTemporarySession(accountId, GEMINI_URL, async (session) => {
          const sessionProbe = await session.probeSession();
          const sessionCookies = await this.tryExtractGeminiCookies(session);
          return { probe: sessionProbe, cookies: sessionCookies };
        });
        probe = result.probe;
        cookies = result.cookies;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already in use|lock file exists|profile lock/i.test(message)) {
        throw new Error(
          'Browser profile đang bị khóa. Đóng cửa sổ Chromium cũ hoặc khởi động lại app rồi thử lại.',
        );
      }
      throw error;
    }

    this.accounts.touchSessionCheck(accountId);

    const fallbackEmail = fallback?.email?.trim() ?? undefined;
    const fallbackLabel = fallback?.label?.trim() ?? undefined;

    // User confirmed login with an email — trust it even if DOM probe is inconclusive.
    if (!probe.usable && fallbackEmail) {
      this.accounts.update(accountId, {
        status: 'READY',
        email: fallbackEmail,
        label: fallbackLabel ?? account.label,
        displayName: fallbackLabel ?? probe.displayName ?? fallbackEmail,
        lastSeenAt: new Date().toISOString(),
      });
      this.markWorkerReadyIfIdle(accountId);
      await this.autoProvisionGeminiWebApi(accountId, fallbackEmail, cookies);
      return this.assertDetail(accountId);
    }

    if (!probe.usable) {
      const status: GoogleAccountStatus =
        probe.reason === 'NEEDS_ATTENTION' || probe.reason === 'BROWSER_NOT_SECURE'
          ? 'NEEDS_ATTENTION'
          : 'LOGIN_REQUIRED';
      this.accounts.update(accountId, { status });
      throw new Error(
        probe.reason === 'BROWSER_NOT_SECURE'
          ? 'Google báo trình duyệt không an toàn. Cần Chrome hoặc Edge; đóng cửa sổ automation cũ rồi Mở trình duyệt lại.'
          : probe.reason === 'NEEDS_ATTENTION'
            ? 'Session cần chú ý (CAPTCHA / unusual traffic). Mở trình duyệt, xử lý xong rồi thử lại.'
            : 'Chưa thấy session Google đã đăng nhập. Mở trình duyệt, đăng nhập, nhập email rồi bấm Đã đăng nhập.',
      );
    }

    const email = probe.email ?? fallbackEmail ?? account.email;
    const label = fallbackLabel ?? account.label;

    if (!email) {
      this.accounts.update(accountId, { status: 'LOGIN_REQUIRED' });
      throw new Error(
        'Could not detect Google email automatically. Provide label/email to finish setup.',
      );
    }

    this.accounts.update(accountId, {
      status: 'READY',
      email,
      label,
      displayName: probe.displayName ?? label,
      lastSeenAt: new Date().toISOString(),
    });
    this.markWorkerReadyIfIdle(accountId);

    await this.autoProvisionGeminiWebApi(accountId, email, cookies);

    return this.assertDetail(accountId);
  }

  rename(accountId: string, label: string): GoogleAccountDetail {
    this.requireAccount(accountId);
    this.accounts.update(accountId, { label, displayName: label });
    return this.assertDetail(accountId);
  }

  setPlan(accountId: string, plan: GoogleAccountPlan): GoogleAccountDetail {
    this.requireAccount(accountId);
    this.accounts.update(accountId, { plan });
    return this.assertDetail(accountId);
  }

  setNotes(accountId: string, notes: string | null): GoogleAccountDetail {
    this.requireAccount(accountId);
    this.accounts.update(accountId, { notes });
    return this.assertDetail(accountId);
  }

  async openBrowser(
    accountId: string,
    target: 'gemini' | 'notebook' = 'gemini',
  ): Promise<GoogleAccountDetail> {
    this.requireAccount(accountId);
    const url = target === 'notebook' ? NOTEBOOK_URL : GEMINI_URL;
    try {
      await this.openBrowserSession(accountId, url);
    } catch (error) {
      if (error instanceof ProfileBusyError) {
        throw new Error(
          `PROFILE_BUSY: Profile đang được sử dụng bởi: ${error.lease.label}`,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/Executable doesn't exist|browserType\.launch|playwright|Chromium|Edge hoặc Google Chrome/i.test(message)) {
        // Never tell end users to run npx — prefer Edge/Chrome.
        if (/Edge|Chrome|Chromium|Không tìm thấy/i.test(message)) {
          throw new Error(message);
        }
        throw new Error(
          'Không tìm thấy Microsoft Edge hoặc Google Chrome. Cài Edge hoặc Chrome để dùng Browser provider.',
        );
      }
      if (/PROFILE_BUSY|already in use|profile lease|profile lock/i.test(message)) {
        throw new Error(message);
      }
      throw error;
    }
    this.accounts.update(accountId, {
      status: 'BUSY',
      lastUsedAt: new Date().toISOString(),
    });
    return this.assertDetail(accountId);
  }

  async closeBrowser(accountId: string): Promise<GoogleAccountDetail> {
    await this.closeBrowserSession(accountId);
    const account = this.requireAccount(accountId);
    if (account.status === 'BUSY') {
      this.accounts.update(accountId, {
        status: account.email ? 'READY' : 'LOGIN_REQUIRED',
      });
    }
    return this.assertDetail(accountId);
  }

  async testSession(accountId: string): Promise<{
    account: GoogleAccountDetail;
    usable: boolean;
    email: string | null;
    reason?: string;
  }> {
    this.requireAccount(accountId);
    const handle = this.openSessions.get(accountId);
    let probe;
    let cookies: GeminiSessionCookies | null = null;
    try {
      if (handle?.isOpen()) {
        probe = await handle.probeSession();
        cookies = await this.tryExtractGeminiCookies(handle);
      } else {
        const result = await this.withTemporarySession(accountId, GEMINI_URL, async (session) => {
          const sessionProbe = await session.probeSession();
          const sessionCookies = await this.tryExtractGeminiCookies(session);
          return { probe: sessionProbe, cookies: sessionCookies };
        });
        probe = result.probe;
        cookies = result.cookies;
      }
    } catch (error) {
      if (
        error instanceof ProfileBusyError ||
        /PROFILE_BUSY|already in use|lock file exists|profile (lease|lock)/i.test(
          error instanceof Error ? error.message : String(error),
        )
      ) {
        this.accounts.update(accountId, { status: 'BUSY' });
        return {
          account: this.assertDetail(accountId),
          usable: false,
          email: null,
          reason: 'BUSY',
        };
      }
      throw error;
    }

    this.accounts.touchSessionCheck(accountId);

    if (probe.usable) {
      this.accounts.update(accountId, {
        status: 'READY',
        email: probe.email ?? this.requireAccount(accountId).email,
        lastSeenAt: new Date().toISOString(),
      });
      this.markWorkerReadyIfIdle(accountId);
      const email = probe.email ?? this.requireAccount(accountId).email;
      if (email) {
        await this.autoProvisionGeminiWebApi(accountId, email, cookies);
      }
    } else if (
      probe.reason === 'NEEDS_ATTENTION' ||
      probe.reason === 'BROWSER_NOT_SECURE'
    ) {
      this.accounts.update(accountId, { status: 'NEEDS_ATTENTION' });
    } else {
      this.accounts.update(accountId, { status: 'LOGIN_REQUIRED' });
    }

    return {
      account: this.assertDetail(accountId),
      usable: probe.usable,
      email: probe.email,
      reason: probe.reason,
    };
  }

  disableWorker(accountId: string): GoogleAccountDetail {
    this.requireAccount(accountId);
    this.accounts.setWorkerEnabled(accountId, false);
    this.accounts.update(accountId, { status: 'DISABLED' });
    return this.assertDetail(accountId);
  }

  enableWorker(accountId: string): GoogleAccountDetail {
    this.requireAccount(accountId);
    this.accounts.setWorkerEnabled(accountId, true);
    const account = this.requireAccount(accountId);
    this.accounts.update(accountId, {
      status: account.email ? 'READY' : 'LOGIN_REQUIRED',
    });
    return this.assertDetail(accountId);
  }

  async removeAccount(accountId: string, confirm: boolean): Promise<{ ok: true }> {
    if (!confirm) {
      throw new Error('Delete confirmation required');
    }
    const account = this.requireAccount(accountId);
    await this.closeBrowserSession(accountId);

    const profile = this.accounts.getProfile(accountId);
    this.accounts.delete(accountId);
    this.auditLog.accountRemoved(accountId, account.label);

    if (profile) {
      try {
        const profilePath = this.profiles.resolveProfilePath(profile.profile_dir_name);
        this.locks.recoverIfStale(profilePath);
        this.profiles.deleteProfileDirectory(profile.profile_dir_name);
      } catch (error) {
        logger.warn('Failed to delete browser profile directory', {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { ok: true };
  }

  private async openBrowserSession(accountId: string, startUrl: string): Promise<void> {
    const existing = this.openSessions.get(accountId);
    if (existing) {
      if (existing.isOpen()) {
        try {
          await existing.focus(startUrl);
          return;
        } catch (error) {
          logger.warn('Existing browser session unusable; reopening', {
            accountId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.openSessions.delete(accountId);
      this.stopLeaseHeartbeat(accountId);
      try {
        this.locks.releaseLease(existing.profilePath, accountId);
      } catch {
        this.locks.recoverIfStale(existing.profilePath);
      }
    }

    // Evict persistent translation runtime before opening Accounts browser.
    try {
      const { getBrowserRuntimeManager } = await import(
        '../automation/browser-runner/browser-runtime-manager'
      );
      await getBrowserRuntimeManager().evictForExternalLaunch(accountId);
    } catch {
      // ignore
    }

    const profile = this.accounts.getProfile(accountId);
    if (!profile) {
      throw new Error('Browser profile missing for account');
    }

    const profilePath = this.profiles.resolveProfilePath(profile.profile_dir_name);
    // Recover only if PID dead / lease expired — never force-clear a live translation lock.
    this.locks.recoverIfStale(profilePath);

    this.locks.acquireLease({
      profilePath,
      ownerId: accountId,
      accountId,
      operation: 'manual_browser',
      label: 'Mở trình duyệt thủ công',
    });
    this.leaseHeartbeats.set(
      accountId,
      startLeaseHeartbeat(this.locks, { profilePath, ownerId: accountId }),
    );

    try {
      const handle = await this.browser.open({
        accountId,
        profilePath,
        startUrl,
        headless: false,
        onClose: () => {
          this.openSessions.delete(accountId);
          this.stopLeaseHeartbeat(accountId);
          try {
            this.locks.releaseLease(profilePath, accountId);
          } catch {
            this.locks.recoverIfStale(profilePath);
          }
          const account = this.accounts.getById(accountId);
          if (account?.status === 'BUSY') {
            this.accounts.update(accountId, {
              status: account.email ? 'READY' : 'LOGIN_REQUIRED',
            });
          }
        },
      });
      this.openSessions.set(accountId, handle);
    } catch (error) {
      this.stopLeaseHeartbeat(accountId);
      try {
        this.locks.releaseLease(profilePath, accountId);
      } catch {
        this.locks.recoverIfStale(profilePath);
      }
      throw error;
    }
  }

  private stopLeaseHeartbeat(accountId: string): void {
    const stop = this.leaseHeartbeats.get(accountId);
    if (stop) {
      stop();
      this.leaseHeartbeats.delete(accountId);
    }
  }

  private async closeBrowserSession(accountId: string): Promise<void> {
    const handle = this.openSessions.get(accountId);
    if (!handle) {
      return;
    }
    try {
      await handle.close();
    } finally {
      this.openSessions.delete(accountId);
      this.stopLeaseHeartbeat(accountId);
      try {
        this.locks.releaseLease(handle.profilePath, accountId);
      } catch {
        this.locks.recoverIfStale(handle.profilePath);
      }
    }
  }

  private async withTemporarySession<T>(
    accountId: string,
    startUrl: string,
    fn: (handle: BrowserSessionHandle) => Promise<T>,
  ): Promise<T> {
    const existing = this.openSessions.get(accountId);
    if (existing?.isOpen()) {
      return fn(existing);
    }
    if (existing) {
      this.openSessions.delete(accountId);
      this.stopLeaseHeartbeat(accountId);
      try {
        this.locks.releaseLease(existing.profilePath, accountId);
      } catch {
        this.locks.recoverIfStale(existing.profilePath);
      }
    }

    await this.openBrowserSession(accountId, startUrl);
    const session = this.openSessions.get(accountId);
    if (!session) {
      throw new Error('Browser session failed to open');
    }
    try {
      return await fn(session);
    } finally {
      await this.closeBrowserSession(accountId);
    }
  }

  private markWorkerReadyIfIdle(accountId: string): void {
    this.accounts.markWorkerReadyIfIdle(accountId);
  }

  private async tryExtractGeminiCookies(
    handle: BrowserSessionHandle,
  ): Promise<GeminiSessionCookies | null> {
    try {
      const cookies = await handle.extractGeminiCookies();
      return cookies.secure1psid ? cookies : null;
    } catch (error) {
      logger.warn('Failed to extract Gemini cookies from browser session', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async autoProvisionGeminiWebApi(
    googleAccountId: string,
    email: string,
    cookies: GeminiSessionCookies | null,
  ): Promise<void> {
    if (!cookies?.secure1psid) {
      return;
    }
    try {
      const { getAiProviderService } = await import('../ai/ai-provider-singleton');
      await getAiProviderService().provisionFromGoogleAccount({
        googleAccountId,
        googleEmail: email,
        secure1psid: cookies.secure1psid,
        secure1psidts: cookies.secure1psidts || undefined,
      });
    } catch (error) {
      logger.warn('Gemini Web API auto-provision failed', {
        googleAccountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private requireAccount(accountId: string) {
    const account = this.accounts.getById(accountId);
    if (!account) {
      throw new Error(`Google account not found: ${accountId}`);
    }
    return account;
  }

  private assertDetail(accountId: string): GoogleAccountDetail {
    const detail = this.getAccount(accountId);
    if (!detail) {
      throw new Error(`Google account detail missing: ${accountId}`);
    }
    return detail;
  }
}
