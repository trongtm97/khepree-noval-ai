import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { KhepreeAccessStateSchema } from '@shared/schemas/khepree';

const FORBIDDEN_RENDERER_FIELDS = [
  'accessToken',
  'refreshToken',
  'privateKey',
  'devicePrivateKey',
  'signature',
  'lease',
  'encryptedBlob',
  'secretKey',
] as const;

describe('Khepree renderer API surface', () => {
  it('KhepreeAccessState schema excludes secret fields', () => {
    const shapeKeys = Object.keys(KhepreeAccessStateSchema.shape);
    for (const forbidden of FORBIDDEN_RENDERER_FIELDS) {
      expect(shapeKeys).not.toContain(forbidden);
    }
  });

  it('preload khepree API exposes no token or key channels', () => {
    const preloadPath = path.resolve(__dirname, '../../../src/preload/preload.ts');
    const source = fs.readFileSync(preloadPath, 'utf8');
    const khepreeBlock = /khepree:\s*\{([\s\S]*?)\n\s*\},/.exec(source)?.[1] ?? '';
    expect(khepreeBlock).not.toMatch(/accessToken|refreshToken|privateKey|getPlainText|secret/i);
    expect(khepreeBlock).toContain('getAccessState');
    expect(khepreeBlock).toContain('startLogin');
  });

  it('ipc types khepree block exposes sanitized state only', () => {
    const ipcTypesPath = path.resolve(__dirname, '../../../src/shared/types/ipc.ts');
    const source = fs.readFileSync(ipcTypesPath, 'utf8');
    const khepreeBlock = /khepree:\s*\{([\s\S]*?)\n\s*\};/m.exec(source)?.[1] ?? '';
    expect(khepreeBlock).not.toMatch(/accessToken|refreshToken|privateKey|KhepreeSignedLease/i);
    expect(khepreeBlock).toContain('KhepreeAccessState');
  });
});
