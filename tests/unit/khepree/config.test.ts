import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  KHEPREE_ENDPOINTS,
  buildKhepreeAuthorizeUrl,
  getKhepreeApiBaseUrl,
  getKhepreeProductId,
} from '@main/khepree/config';
import { KHEPREE_EXTERNAL_URLS, KHEPREE_OAUTH_REDIRECT_URI, KHEPREE_PRODUCT_SLUG, KHEPREE_PRODUCTION } from '@shared/constants/khepree';
import { getKhepreeOAuthClientId } from '@main/khepree/config';

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
    expect(KHEPREE_PRODUCTION.apiBase).toBe('https://api.khepree.com/api/v1');
    expect(KHEPREE_ENDPOINTS.api).toBe(KHEPREE_PRODUCTION.apiBase);
    expect(KHEPREE_ENDPOINTS.website).toBe('https://khepree.com');
    expect(KHEPREE_ENDPOINTS.account).toBe('https://account.khepree.com');
    expect(KHEPREE_EXTERNAL_URLS.plans).toBe('https://account.khepree.com/billing');
  });

  it('builds production authorize URL', () => {
    const url = buildKhepreeAuthorizeUrl({
      state: 'state-1',
      codeChallenge: 'challenge',
      redirectUri: KHEPREE_OAUTH_REDIRECT_URI,
      clientId: getKhepreeOAuthClientId(),
      installationId: 'inst-1',
      productId: KHEPREE_PRODUCT_SLUG,
    });
    expect(url).toBe(
      'https://account.khepree.com/desktop/authorize?client_id=khepree.novel-ai.desktop&redirect_uri=khepreenovelai%3A%2F%2Fauth%2Fcallback&state=state-1&code_challenge=challenge&code_challenge_method=S256',
    );
  });

  it('allows dev env override when unpackaged', () => {
    process.env.KHEPREE_API_BASE = 'http://localhost:3004/api/v1';
    expect(getKhepreeApiBaseUrl()).toBe('http://localhost:3004/api/v1');
  });

  it('defaults product slug in dev', () => {
    delete process.env.KHEPREE_PRODUCT_ID;
    expect(getKhepreeProductId()).toBe(KHEPREE_PRODUCT_SLUG);
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
    expect(packagedUrl()).toBe('https://api.khepree.com/api/v1');
    vi.resetModules();
  });
});
