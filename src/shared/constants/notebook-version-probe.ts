/**
 * Knowledge version probe — prove Notebook reads current sync-state content,
 * not merely that a source card with the right name exists.
 */
export const SYNC_STATE_SOURCE_NAME = '08_SYNC_STATE';
export const SYNC_STATE_SOURCE_ALIAS = '_KHEPREE_NOVEL_AI_STATE';

export const VERSION_PROBE_PROMPT = [
  'From the Khepree Novel AI sync-state source,',
  'return ONLY:',
  '',
  'NT_VERSION=<value>',
  'NT_NONCE=<value>',
  '',
  'Do not infer or guess.',
].join('\n');

export type VersionProbeStatus =
  | 'verified'
  | 'mismatch'
  | 'unverified'
  | 'pending';

export interface SyncStateManifest {
  projectId: string;
  knowledgeVersion: number;
  syncNonce: string;
}

export interface VersionProbeEvaluation {
  status: 'verified' | 'mismatch' | 'unverified';
  parsedVersion: number | null;
  parsedNonce: string | null;
  reason: string;
}

export function generateSyncNonce(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function buildSyncStateManifestContent(manifest: SyncStateManifest): string {
  return [
    '# Khepree Novel AI sync state',
    '# Machine-readable — do not paraphrase.',
    `KHEPREE_NOVEL_AI_PROJECT_ID=${manifest.projectId}`,
    `KHEPREE_NOVEL_AI_KNOWLEDGE_VERSION=${manifest.knowledgeVersion}`,
    `KHEPREE_NOVEL_AI_SYNC_NONCE=${manifest.syncNonce}`,
  ].join('\n');
}

export function parseSyncStateManifestContent(
  content: string,
): SyncStateManifest | null {
  const projectId =
    (/KHEPREE_NOVEL_AI_PROJECT_ID=(\S+)/.exec(content))?.[1] ??
    (/NOVELTRANS_PROJECT_ID=(\S+)/.exec(content))?.[1] ??
    null;
  const versionRaw =
    (/KHEPREE_NOVEL_AI_KNOWLEDGE_VERSION=(\d+)/.exec(content))?.[1] ??
    (/NOVELTRANS_KNOWLEDGE_VERSION=(\d+)/.exec(content))?.[1] ??
    null;
  const syncNonce =
    (/KHEPREE_NOVEL_AI_SYNC_NONCE=([A-Fa-f0-9]+)/.exec(content))?.[1] ??
    (/NOVELTRANS_SYNC_NONCE=([A-Fa-f0-9]+)/.exec(content))?.[1] ??
    null;
  if (!projectId || !versionRaw || !syncNonce) return null;
  return {
    projectId,
    knowledgeVersion: Number(versionRaw),
    syncNonce: syncNonce.toUpperCase(),
  };
}

/** Parse Notebook probe reply for NT_VERSION / NT_NONCE. */
export function parseVersionProbeResponse(raw: string): {
  version: number | null;
  nonce: string | null;
} {
  const versionMatch = /NT_VERSION\s*=\s*(\d+)/i.exec(raw);
  const nonceMatch = /NT_NONCE\s*=\s*([A-Fa-f0-9]+)/i.exec(raw);
  return {
    version: versionMatch ? Number(versionMatch[1]) : null,
    nonce: nonceMatch ? nonceMatch[1].toUpperCase() : null,
  };
}

export function evaluateVersionProbeResponse(
  raw: string,
  expected: { knowledgeVersion: number; syncNonce: string },
): VersionProbeEvaluation {
  const parsed = parseVersionProbeResponse(raw);
  if (parsed.version == null || !parsed.nonce) {
    return {
      status: 'unverified',
      parsedVersion: parsed.version,
      parsedNonce: parsed.nonce,
      reason: 'NOTEBOOK_GROUNDING_UNVERIFIED',
    };
  }
  if (
    parsed.version === expected.knowledgeVersion &&
    parsed.nonce === expected.syncNonce.toUpperCase()
  ) {
    return {
      status: 'verified',
      parsedVersion: parsed.version,
      parsedNonce: parsed.nonce,
      reason: 'NOTEBOOK_VERSION_VERIFIED',
    };
  }
  return {
    status: 'mismatch',
    parsedVersion: parsed.version,
    parsedNonce: parsed.nonce,
    reason: 'NOTEBOOK_VERSION_MISMATCH',
  };
}
