import { describe, expect, it } from 'vitest';
import {
  isAllowedKhepreeUrl,
  resolveKhepreeExternalUrl,
} from '@main/khepree/external-links';

describe('khepree external links', () => {
  it('allows pinned Khepree HTTPS hosts', () => {
    expect(isAllowedKhepreeUrl('https://khepree.com/')).toBe(true);
    expect(isAllowedKhepreeUrl('https://account.khepree.com/devices')).toBe(true);
  });

  it('blocks arbitrary hosts', () => {
    expect(isAllowedKhepreeUrl('https://evil.example/phish')).toBe(false);
    expect(isAllowedKhepreeUrl('http://khepree.com/')).toBe(false);
  });

  it('resolves known targets', () => {
    expect(resolveKhepreeExternalUrl('website')).toBe('https://khepree.com');
    expect(resolveKhepreeExternalUrl('products')).toBe('https://khepree.com/products');
    expect(resolveKhepreeExternalUrl('productHub')).toBe(
      'https://account.khepree.com/products/khepree-novel-ai',
    );
    expect(resolveKhepreeExternalUrl('devices')).toBe('https://account.khepree.com/devices');
  });
});
