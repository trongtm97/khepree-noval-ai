import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BrowserCompatibilityPatch,
  activeBrowserCompatibilityPatches,
  buildPlaywrightLaunchPatchOptions,
} from '../../../src/main/automation/browser-runner/browser-compatibility-patch';

describe('BrowserCompatibilityPatch', () => {
  it('default launch patch options are empty (standard Playwright)', () => {
    expect(
      buildPlaywrightLaunchPatchOptions({
        loginCompat: false,
        disableAutomationControlled: false,
      }),
    ).toEqual({});
    expect(activeBrowserCompatibilityPatches({})).toEqual([]);
  });

  it('GOOGLE_LOGIN_LAUNCH patch ignores --enable-automation and disables AutomationControlled', () => {
    expect(
      buildPlaywrightLaunchPatchOptions({
        loginCompat: true,
        disableAutomationControlled: true,
      }),
    ).toEqual({
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    expect(
      activeBrowserCompatibilityPatches({
        loginCompat: true,
        disableAutomationControlled: true,
      }),
    ).toEqual([
      BrowserCompatibilityPatch.GOOGLE_LOGIN_LAUNCH,
      BrowserCompatibilityPatch.DISABLE_AUTOMATION_CONTROLLED,
    ]);
  });

  it('DISABLE_AUTOMATION_CONTROLLED alone adds blink flag only', () => {
    expect(
      buildPlaywrightLaunchPatchOptions({
        loginCompat: false,
        disableAutomationControlled: true,
      }),
    ).toEqual({
      args: ['--disable-blink-features=AutomationControlled'],
    });
  });
});

describe('browser provider launch architecture (no stealth dependency)', () => {
  it('playwright-browser-ai-service does not import stealth or apply init scripts', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/services/playwright-browser-ai-service.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/playwright-stealth|applyPlaywrightStealth|addInitScript/);
    expect(source).not.toMatch(/loginCompat:\s*true/);
  });

  it('Gemini Google login uses GOOGLE_LOGIN_LAUNCH patch only', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/automation/browser-runner/browser-session-controller.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/loginCompat:\s*true/);
    expect(source).not.toMatch(/playwright-stealth|applyPlaywrightStealth|addInitScript/);
  });

  it('browser-runtime-manager send path does not reference stealth', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/automation/browser-runner/browser-runtime-manager.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/playwright-stealth|applyPlaywrightStealth|addInitScript/);
  });

  it('profile manager rejects path traversal outside browserProfiles root', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/automation/browser-runner/profile-manager.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/escapes browser-profiles directory/);
    expect(source).toMatch(/pathsService\.getPath\('browserProfiles'\)/);
  });
});

describe('session verify selectors (UI detection, not stealth)', () => {
  it('ChatGPT verify uses prompt textarea selectors', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/services/playwright-browser-ai-service.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/isChatGptLoggedIn/);
    expect(source).toMatch(/prompt-textarea/);
  });

  it('Meta AI verify uses composer and user-menu selectors', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/services/playwright-browser-ai-service.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/isMetaAiLoggedIn/);
    expect(source).toMatch(/composer-input|user-menu-button/);
  });

  it('Gemini session probe detects login, CAPTCHA, insecure-browser interstitial', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/main/automation/browser-runner/browser-session-controller.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(/looksLikeGoogleLoginPage/);
    expect(source).toMatch(/looksLikeInsecureBrowserInterstitial/);
    expect(source).toMatch(/NEEDS_ATTENTION/);
    expect(source).not.toMatch(/solveCaptcha|recaptcha.*click|bypassCaptcha/i);
  });
});
