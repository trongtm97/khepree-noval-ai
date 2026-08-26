import { describe, it, expect } from 'vitest';
import {
  PingResponseSchema,
  GetVersionResponseSchema,
  GetInfoResponseSchema,
  GetPathsResponseSchema,
  OpenFolderRequestSchema,
  OpenFolderResponseSchema,
} from '@shared/schemas/ipc';

describe('IPC schemas', () => {
  it('validates ping response', () => {
    const result = PingResponseSchema.parse({
      ok: true,
      timestamp: '2026-08-23T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid ping response', () => {
    expect(() =>
      PingResponseSchema.parse({ ok: false, timestamp: '2026-08-23T00:00:00.000Z' }),
    ).toThrow();
  });

  it('validates version response', () => {
    const result = GetVersionResponseSchema.parse({
      version: '0.1.0',
      name: 'NovelTrans Studio',
    });
    expect(result.version).toBe('0.1.0');
  });

  it('validates getInfo response', () => {
    const result = GetInfoResponseSchema.parse({
      name: 'NovelTrans Studio',
      version: '0.1.0',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '33.0.0',
      nodeVersion: '20.0.0',
      isPackaged: false,
    });
    expect(result.platform).toBe('win32');
  });

  it('validates getPaths response', () => {
    const result = GetPathsResponseSchema.parse({
      root: 'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio',
      data: 'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio\\data',
      logs: 'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio\\logs',
      browserProfiles:
        'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio\\browser-profiles',
      exports: 'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio\\exports',
      backups: 'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio\\backups',
      cache: 'C:\\Users\\test\\AppData\\Roaming\\noveltrans-studio\\cache',
    });
    expect(result.logs).toContain('logs');
  });

  it('validates openFolder request', () => {
    const result = OpenFolderRequestSchema.parse({ pathKey: 'logs' });
    expect(result.pathKey).toBe('logs');
  });

  it('rejects invalid openFolder pathKey', () => {
    expect(() => OpenFolderRequestSchema.parse({ pathKey: 'invalid' })).toThrow();
  });

  it('validates openFolder response', () => {
    const result = OpenFolderResponseSchema.parse({
      ok: true,
      path: '/tmp/logs',
    });
    expect(result.ok).toBe(true);
  });
});
