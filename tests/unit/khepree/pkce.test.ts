import { describe, expect, it } from 'vitest';
import { deriveS256Challenge, generatePkcePair } from '@main/khepree/pkce';

describe('pkce', () => {
  it('generates verifier and matching S256 challenge', () => {
    const pair = generatePkcePair();
    expect(pair.codeChallengeMethod).toBe('S256');
    expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(deriveS256Challenge(pair.codeVerifier)).toBe(pair.codeChallenge);
  });

  it('generates unique pairs', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});
