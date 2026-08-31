import { createHash, randomBytes } from 'node:crypto';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/** RFC 7636 PKCE pair for OAuth authorization code flow. */
export function generatePkcePair(): PkcePair {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(
    createHash('sha256').update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

export function deriveS256Challenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
}
