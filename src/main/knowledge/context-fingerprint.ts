import { createHash } from 'node:crypto';
import { LOCAL_KNOWLEDGE_ENGINE_VERSION } from '@shared/constants/context-budget';

export interface ContextFingerprint {
  contextVersion: number;
  contextHash: string;
  termCount: number;
  characterCount: number;
  relationshipCount: number;
  memoryCount: number;
  estimatedTokens: number;
  engineVersion: number;
}

export interface ContextFingerprintInput {
  contextVersion: number;
  termIds: string[];
  characterIds: string[];
  relationshipIds: string[];
  memoryKeys: string[];
  estimatedTokens: number;
}

function stableHash(parts: string[]): string {
  const payload = parts.slice().sort().join('\n');
  return createHash('sha256').update(payload).digest('hex');
}

export function buildContextFingerprint(input: ContextFingerprintInput): ContextFingerprint {
  const contextHash = stableHash([
    ...input.termIds.map((id) => `t:${id}`),
    ...input.characterIds.map((id) => `c:${id}`),
    ...input.relationshipIds.map((id) => `r:${id}`),
    ...input.memoryKeys.map((key) => `m:${key}`),
    `v:${input.contextVersion}`,
    `e:${LOCAL_KNOWLEDGE_ENGINE_VERSION}`,
  ]);

  return {
    contextVersion: input.contextVersion,
    contextHash,
    termCount: input.termIds.length,
    characterCount: input.characterIds.length,
    relationshipCount: input.relationshipIds.length,
    memoryCount: input.memoryKeys.length,
    estimatedTokens: input.estimatedTokens,
    engineVersion: LOCAL_KNOWLEDGE_ENGINE_VERSION,
  };
}
