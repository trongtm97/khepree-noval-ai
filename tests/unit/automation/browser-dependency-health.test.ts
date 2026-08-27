import { describe, expect, it } from 'vitest';
import { assessBrowserDependencyHealth } from '@main/automation/browser-runner/browser-dependency-health';
import {
  resolveBrowserEngine,
  windowsChromeCandidates,
  windowsEdgeCandidates,
} from '@main/automation/browser-runner/browser-engine-resolver';

describe('BrowserDependencyHealth', () => {
  it('AUTO usable when Edge exists (Chromium absent)', () => {
    const env = {
      ProgramFiles: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PF86',
    };
    const edgePath = windowsEdgeCandidates(env)[0];
    const health = assessBrowserDependencyHealth('AUTO', {
      platform: 'win32',
      env,
      existsSync: (p) => p === edgePath,
      chromiumExecutablePath: null,
      playwrightVersion: '1.62.1',
    });
    expect(health.browserUsable).toBe(true);
    expect(health.preferredEngine).toBe('EDGE');
    expect(health.message).not.toMatch(/npx/i);
  });

  it('AUTO not usable when no Edge/Chrome/Chromium', () => {
    const health = assessBrowserDependencyHealth('AUTO', {
      platform: 'win32',
      existsSync: () => false,
      chromiumExecutablePath: null,
      playwrightVersion: '1.62.1',
    });
    expect(health.browserUsable).toBe(false);
    expect(health.preferredEngine).toBeNull();
    expect(health.message).toMatch(/Edge|Chrome/i);
    expect(health.message).not.toMatch(/npx/i);
  });

  it('AUTO uses Chromium only when executable exists', () => {
    const chromiumPath = 'C:\\browsers\\chromium.exe';
    const health = assessBrowserDependencyHealth('AUTO', {
      platform: 'win32',
      existsSync: (p) => p === chromiumPath,
      chromiumExecutablePath: chromiumPath,
      playwrightVersion: '1.62.1',
    });
    expect(health.browserUsable).toBe(true);
    expect(health.preferredEngine).toBe('PLAYWRIGHT_CHROMIUM');
    expect(health.chromiumAvailable).toBe(true);
  });

  it('PLAYWRIGHT_CHROMIUM refuses missing binary', () => {
    expect(() =>
      resolveBrowserEngine('PLAYWRIGHT_CHROMIUM', {
        platform: 'win32',
        chromiumAvailable: false,
        chromiumExecutablePath: null,
        playwrightVersion: '1.62.1',
      }),
    ).toThrow(/Chromium|Edge|Chrome/i);
  });

  it('Chrome preferred over Chromium when both exist', () => {
    const env = {
      ProgramFiles: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PF86',
      LOCALAPPDATA: 'C:\\Local',
    };
    const chromePath = windowsChromeCandidates(env)[0];
    const chromiumPath = 'C:\\browsers\\chromium.exe';
    const health = assessBrowserDependencyHealth('AUTO', {
      platform: 'win32',
      env,
      existsSync: (p) => p === chromePath || p === chromiumPath,
      chromiumExecutablePath: chromiumPath,
      playwrightVersion: '1.62.1',
    });
    expect(health.preferredEngine).toBe('CHROME');
  });
});
