import { createHash } from 'node:crypto';
import { naturalCompare } from '@shared/utils/natural-sort';
import { sha256Text } from '../import/hash';

/**
 * Stable content fingerprint for duplicate detection across candidates.
 * Folder novels: sorted chapter content hashes joined, then hashed.
 * Single-file novels: sha256 of normalized full text.
 */
export function fingerprintFromContentHashes(contentHashes: string[]): string {
  const sorted = [...contentHashes].filter(Boolean).sort(naturalCompare);
  return sha256Text(sorted.join('\n'));
}

export function fingerprintFromNormalizedText(text: string): string {
  return sha256Text(text);
}

/** Short hex prefix for logging / tests — not for identity. */
export function fingerprintPrefix(fingerprint: string, len = 12): string {
  return fingerprint.slice(0, len);
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
