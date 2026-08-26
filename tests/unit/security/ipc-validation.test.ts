import { describe, it, expect } from 'vitest';
import {
  OpenFolderRequestSchema,
  SecurityHealthCheckResponseSchema,
} from '@shared/schemas/ipc';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { IpcValidationError, createIpcHandler } from '@main/ipc/validate';
import {
  IPC_CHANNEL_AUDIT,
  assertIpcAuditComplete,
} from '@main/security/ipc-audit';

describe('IPC validation', () => {
  it('rejects arbitrary path / invalid openFolder payload', () => {
    expect(() =>
      OpenFolderRequestSchema.parse({ pathKey: 'C:\\Windows\\System32' }),
    ).toThrow();
    expect(() => OpenFolderRequestSchema.parse({ pathKey: '../../etc' })).toThrow();
    expect(() => OpenFolderRequestSchema.parse({})).toThrow();
    expect(OpenFolderRequestSchema.parse({ pathKey: 'logs' }).pathKey).toBe('logs');
  });

  it('createIpcHandler throws IpcValidationError on bad input', async () => {
    const handler = createIpcHandler(
      OpenFolderRequestSchema,
      (req) => ({ ok: true as const, path: req.pathKey }),
    );

    await expect(handler({} as never, { pathKey: 'not-a-key' })).rejects.toBeInstanceOf(
      IpcValidationError,
    );
  });

  it('validates security health response shape', () => {
    const parsed = SecurityHealthCheckResponseSchema.parse({
      available: true,
      backend: 'dpapi',
      mode: 'sync-wrapped',
      message: 'ok',
    });
    expect(parsed.available).toBe(true);
  });

  it('IPC audit covers every channel and secrets stay forbidden', () => {
    expect(() => {
      assertIpcAuditComplete();
    }).not.toThrow();

    for (const entry of IPC_CHANNEL_AUDIT) {
      expect(entry.allowsSecrets).toBe(false);
    }

    const openFolder = IPC_CHANNEL_AUDIT.find(
      (e) => e.channel === IPC_CHANNELS.APP_OPEN_FOLDER,
    );
    expect(openFolder?.allowsShell).toBe(true);
    expect(openFolder?.notes).toContain('managed');

    const importPreview = IPC_CHANNEL_AUDIT.find(
      (e) => e.channel === IPC_CHANNELS.IMPORT_PREVIEW,
    );
    expect(importPreview?.allowsFilesystem).toBe(true);

    const projectList = IPC_CHANNEL_AUDIT.find(
      (e) => e.channel === IPC_CHANNELS.PROJECT_LIST,
    );
    expect(projectList?.allowsDbQuery).toBe(true);
  });
});