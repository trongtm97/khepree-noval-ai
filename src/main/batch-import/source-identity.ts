import path from 'node:path';

/** Stable path key for identity (lowercase, forward slashes, no trailing slash). */
export function normalizeSourcePathKey(absolutePath: string): string {
  return absolutePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function buildFolderIdentityKey(absoluteFolderPath: string): string {
  return `folder:${normalizeSourcePathKey(absoluteFolderPath)}`;
}

export function buildFileIdentityKey(absoluteFilePath: string): string {
  return `file:${normalizeSourcePathKey(absoluteFilePath)}`;
}

export function candidateIdentityKey(
  kind: 'folder' | 'file',
  absolutePath: string,
): string {
  return kind === 'folder'
    ? buildFolderIdentityKey(absolutePath)
    : buildFileIdentityKey(absolutePath);
}

export function durableCandidateDir(
  dataRoot: string,
  sessionId: string,
  candidateKey: string,
): string {
  return path.join(dataRoot, 'imported-sources', sessionId, candidateKey);
}
