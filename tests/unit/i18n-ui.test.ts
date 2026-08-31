import { describe, expect, it, beforeEach } from 'vitest';
import { vi as viMessages } from '../../src/renderer/i18n/locales/vi';
import { en as enMessages } from '../../src/renderer/i18n/locales/en';
import { detectErrorCode, friendlyError } from '../../src/renderer/i18n/errors';
import { statusLabel, statusTone } from '../../src/renderer/i18n/status';
import { t, useLocaleStore } from '../../src/renderer/i18n';
import fs from 'node:fs';
import path from 'node:path';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const pathKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') keys.push(pathKey);
    else keys.push(...collectKeys(v, pathKey));
  }
  return keys;
}

function getByPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const VIETNAMESE_DIACRITICS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

describe('i18n', () => {
  beforeEach(() => {
    useLocaleStore.setState({ preference: 'vi' });
  });

  it('vi and en have matching leaf keys', () => {
    const viKeys = collectKeys(viMessages).sort();
    const enKeys = collectKeys(enMessages).sort();
    expect(enKeys).toEqual(viKeys);
  });

  it('t() returns Vietnamese by default', () => {
    expect(t('nav.dashboard')).toBe('Tổng quan');
    expect(t('actions.save')).toBe('Lưu');
  });

  it('interpolates params', () => {
    expect(t('statusbar.jobsRunning', { count: 2 })).toContain('2');
  });

  it('en nav and settings strings are not Vietnamese leftovers', () => {
    const prefixes = ['nav.', 'settings.'];
    const hits: string[] = [];
    for (const key of collectKeys(enMessages)) {
      if (!prefixes.some((p) => key.startsWith(p))) continue;
      const value = getByPath(enMessages, key);
      if (typeof value !== 'string') continue;
      if (VIETNAMESE_DIACRITICS.test(value)) {
        hits.push(`${key}: ${value}`);
      }
      const viValue = getByPath(viMessages, key);
      if (typeof viValue === 'string' && value === viValue && VIETNAMESE_DIACRITICS.test(value)) {
        hits.push(`${key} (identical to vi): ${value}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('friendly errors', () => {
  it('maps SELECTOR_NOT_FOUND', () => {
    expect(detectErrorCode('SELECTOR_NOT_FOUND: locator(div)')).toBe('SELECTOR_NOT_FOUND');
    const f = friendlyError('TimeoutError: locator("div:nth-child(1)")');
    expect(f.code).toBe('SELECTOR_NOT_FOUND');
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.technical).toContain('TimeoutError');
  });

  it('maps LOGIN_REQUIRED and QUOTA', () => {
    expect(detectErrorCode('LOGIN_REQUIRED')).toBe('LOGIN_REQUIRED');
    expect(detectErrorCode('QUOTA_LIMIT exceeded')).toBe('QUOTA_LIMIT');
  });
});

describe('status labels', () => {
  it('maps job states to Vietnamese', () => {
    useLocaleStore.setState({ preference: 'vi' });
    expect(statusLabel('READY')).toBe('Sẵn sàng');
    expect(statusLabel('NEEDS_ATTENTION')).toBe('Cần xử lý');
    expect(statusLabel('QUEUED')).toBe('Đang xếp hàng');
    expect(statusLabel('PREPARING')).toBe('Đang chuẩn bị');
    expect(statusLabel('WAITING_WORKER')).toBe('Chờ worker');
    expect(statusTone('RUNNING')).toBe('running');
    expect(statusTone('FAILED')).toBe('error');
    expect(statusTone('QUEUED')).toBe('waiting');
    expect(statusTone('SENDING')).toBe('running');
    expect(statusLabel('SYNC_PENDING')).toBe('Đang chờ đồng bộ');
    expect(statusLabel('TOTALLY_FAKE_ENUM')).toBe('Không xác định');
  });
});

describe('no common English UI leftovers in pages', () => {
  const roots = [
    path.resolve(__dirname, '../../src/renderer/pages'),
    path.resolve(__dirname, '../../src/renderer/layouts'),
    path.resolve(__dirname, '../../src/renderer/components'),
  ];

  const banned = [
    '>Dashboard<',
    '>Settings<',
    '>Projects<',
    'Failed to load',
    'Google Accounts',
    'window.confirm',
    'Export & Backup',
    'Developer Diagnostics',
    'Import wizard',
    'Select a project.',
    'Failed to load versions',
    'label="Close"',
  ];

  function walk(dir: string, files: string[] = []): string[] {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, files);
      else if (entry.name.endsWith('.tsx')) files.push(full);
    }
    return files;
  }

  it('does not contain banned English UI markers', () => {
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = fs.readFileSync(file, 'utf8');
        const rel = path.relative(path.resolve(__dirname, '../../src/renderer'), file);
        for (const ban of banned) {
          if (text.includes(ban)) hits.push(`${rel}: ${ban}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
