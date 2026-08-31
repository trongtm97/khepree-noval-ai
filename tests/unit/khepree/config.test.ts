import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { KHEPREE_ENDPOINTS, getKhepreeApiBaseUrl, getKhepreeProductId } from '@main/khepree/config';
import { KHEPREE_PRODUCT_ID } from '@shared/constants/khepree';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getLocale: () => 'en-US',
  },
}));

describe('Khepree config', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = envSnapshot;
  });

  it('exposes pinned production endpoints', () => {
    expect(KHEPREE_ENDPOINTS.api).toBe('https://api.khepree.com/v1');
    expect(KHEPREE_ENDPOINTS.website).toBe('https://khepree.com');
    expect(KHEPREE_ENDPOINTS.account).toBe('https://account.khepree.com');
  });

  it('allows dev env override when unpackaged', () => {
    process.env.KHEPREE_API_BASE = 'http://localhost:9999/v1';
    expect(getKhepreeApiBaseUrl()).toBe('http://localhost:9999/v1');
  });

  it('defaults product id to novel-ai in dev', () => {
    delete process.env.KHEPREE_PRODUCT_ID;
    expect(getKhepreeProductId()).toBe(KHEPREE_PRODUCT_ID);
  });
});

describe('Khepree config (packaged)', () => {
  it('ignores env API override when packaged', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getLocale: () => 'en-US' },
    }));
    process.env.KHEPREE_API_BASE = 'http://evil.example/v1';
    const { getKhepreeApiBaseUrl: packagedUrl } = await import('@main/khepree/config');
    expect(packagedUrl()).toBe('https://api.khepree.com/v1');
    vi.resetModules();
  });
});
