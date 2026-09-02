/**
 * Opt-in Real Notebook grounding smoke config.
 * Never load production novel notebooks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { assertNotProductionProject } from '../google-smoke/google-smoke-config';

export const GROUNDING_SMOKE_TESTS = ['A', 'B', 'C', 'D'] as const;
export type GroundingSmokeTestId = (typeof GROUNDING_SMOKE_TESTS)[number];

export const NotebookGroundingSmokeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  profilePath: z.string().min(3),
  notebookUrl: z.string().url(),
  headless: z.boolean().default(false),
  smokeProjectLabel: z.string().min(3).default('KHEPREE_NOVEL_AI_SMOKE'),
  tests: z.array(z.enum(GROUNDING_SMOKE_TESTS)).default([...GROUNDING_SMOKE_TESTS]),
  reportMarkdownPath: z.string().default('docs/REAL_NOTEBOOK_GROUNDING_REPORT.md'),
  artifactsDir: z.string().default('tmp/notebook-grounding-smoke-artifacts'),
  allowNonSmokeNotebook: z.boolean().default(false),
  /** Optional worker account — enables Drive LIVE (B/D) + SQLite learning path. */
  accountId: z.string().uuid().optional(),
  /** Pre-linked Drive file for smoke knowledge (preferred for B). */
  groundingKnowledgeDriveFileId: z.string().min(5).optional(),
  /** Pre-linked Drive file for 08_SYNC_STATE / _KHEPREE_NOVEL_AI_STATE. */
  groundingSyncStateDriveFileId: z.string().min(5).optional(),
  /** Drive folder name used when creating smoke docs. */
  groundingDriveFolderName: z.string().min(3).default('KHEPREE_NOVEL_AI_SMOKE_GROUNDING'),
  knowledgeSourceName: z.string().min(3).default('NT_SMOKE_KNOWLEDGE'),
  syncStateSourceName: z.string().min(3).default('08_SYNC_STATE'),
  versionProbeTimeoutMs: z.number().int().positive().default(180_000),
  versionProbeIntervalMs: z.number().int().positive().default(12_000),
});

export type NotebookGroundingSmokeConfig = z.infer<
  typeof NotebookGroundingSmokeConfigSchema
>;

export function isNotebookGroundingSmokeEnvEnabled(): boolean {
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = process.env[key]?.trim().toLowerCase();
      if (value === '1' || value === 'true' || value === 'yes') return true;
    }
    return false;
  };
  if (
    read('KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE', 'NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE')
  ) {
    return true;
  }
  return read('KHEPREE_NOVEL_AI_GOOGLE_SMOKE', 'NOVELTRANS_GOOGLE_SMOKE');
}

export function resolveNotebookGroundingSmokeConfigPath(): string {
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = process.env[key]?.trim();
      if (value) return value;
    }
    return undefined;
  };
  return (
    read(
      'KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE_CONFIG',
      'NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE_CONFIG',
      'KHEPREE_NOVEL_AI_GOOGLE_SMOKE_CONFIG',
      'NOVELTRANS_GOOGLE_SMOKE_CONFIG',
    ) ?? path.resolve(process.cwd(), 'google-smoke.config.json')
  );
}

export function parseNotebookGroundingSmokeConfig(
  raw: unknown,
): NotebookGroundingSmokeConfig {
  const config = NotebookGroundingSmokeConfigSchema.parse(raw);
  assertNotProductionProject({
    enabled: config.enabled,
    profilePath: config.profilePath,
    notebookUrl: config.notebookUrl,
    headless: config.headless,
    smokeProjectLabel: config.smokeProjectLabel,
    scenarios: ['A'],
    reportMarkdownPath: config.reportMarkdownPath,
    artifactsDir: config.artifactsDir,
    allowNonSmokeNotebook: config.allowNonSmokeNotebook,
  });
  return config;
}

export function loadNotebookGroundingSmokeConfig(
  filePath?: string,
): NotebookGroundingSmokeConfig {
  if (!isNotebookGroundingSmokeEnvEnabled()) {
    throw new Error(
      'Notebook grounding smoke disabled. Set KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE=1 (or KHEPREE_NOVEL_AI_GOOGLE_SMOKE=1) and provide config.',
    );
  }
  const resolved = filePath ?? resolveNotebookGroundingSmokeConfigPath();
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Missing smoke config at ${resolved}. Copy google-smoke.config.example.json → google-smoke.config.json`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  const config = parseNotebookGroundingSmokeConfig(raw);
  if (!fs.existsSync(config.profilePath)) {
    throw new Error(`Profile path does not exist: ${config.profilePath}`);
  }
  return config;
}
