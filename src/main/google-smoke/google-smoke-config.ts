/**
 * Opt-in Real Google smoke config.
 * Never load production novel notebooks. Require smoke label in config.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const GOOGLE_SMOKE_SCENARIOS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
] as const;

export type GoogleSmokeScenarioId = (typeof GOOGLE_SMOKE_SCENARIOS)[number];

export const GoogleSmokeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  profilePath: z.string().min(3),
  notebookUrl: z.string().url(),
  headless: z.boolean().default(false),
  /** Must appear in notebookUrl or be set explicitly — blocks production projects. */
  smokeProjectLabel: z.string().min(3).default('NOVELTRANS_SMOKE'),
  scenarios: z.array(z.enum(GOOGLE_SMOKE_SCENARIOS)).default([...GOOGLE_SMOKE_SCENARIOS]),
  reportMarkdownPath: z.string().default('docs/REAL_GOOGLE_TEST_REPORT.md'),
  artifactsDir: z.string().default('tmp/google-smoke-artifacts'),
  /** Hard refuse unless this is false AND label checks pass. */
  allowNonSmokeNotebook: z.boolean().default(false),
});

export type GoogleSmokeConfig = z.infer<typeof GoogleSmokeConfigSchema>;

export const SMOKE_OK_TOKEN = 'NOVELTRANS_SMOKE_OK';

export function isGoogleSmokeEnvEnabled(): boolean {
  const v = process.env.NOVELTRANS_GOOGLE_SMOKE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function resolveGoogleSmokeConfigPath(): string {
  return (
    process.env.NOVELTRANS_GOOGLE_SMOKE_CONFIG?.trim() ??
    path.resolve(process.cwd(), 'google-smoke.config.json')
  );
}

export function parseGoogleSmokeConfig(raw: unknown): GoogleSmokeConfig {
  const config = GoogleSmokeConfigSchema.parse(raw);
  assertNotProductionProject(config);
  return config;
}

export function loadGoogleSmokeConfig(filePath?: string): GoogleSmokeConfig {
  if (!isGoogleSmokeEnvEnabled()) {
    throw new Error(
      'Real Google smoke disabled. Set NOVELTRANS_GOOGLE_SMOKE=1 and provide google-smoke.config.json',
    );
  }
  const resolved = filePath ?? resolveGoogleSmokeConfigPath();
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Missing smoke config at ${resolved}. Copy google-smoke.config.example.json → google-smoke.config.json`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  const config = parseGoogleSmokeConfig(raw);
  if (!fs.existsSync(config.profilePath)) {
    throw new Error(`Profile path does not exist: ${config.profilePath}`);
  }
  return config;
}

/** Refuse production notebooks unless explicitly overridden (still requires label). */
export function assertNotProductionProject(config: GoogleSmokeConfig): void {
  const label = config.smokeProjectLabel;
  const url = config.notebookUrl.toLowerCase();
  const hasLabel =
    url.includes(label.toLowerCase()) ||
    url.includes('smoke') ||
    label.toUpperCase().includes('SMOKE');

  if (config.allowNonSmokeNotebook) {
    throw new Error(
      'allowNonSmokeNotebook is forbidden — create a dedicated SMOKE notebook instead of testing production novels.',
    );
  }

  if (!hasLabel && !url.includes('notebooklm.google.com') && !url.includes('notebook.google.com')) {
    throw new Error(`Smoke notebookUrl must be a NotebookLM URL: ${config.notebookUrl}`);
  }

  // Soft guard: operator must set smokeProjectLabel; document that notebook title should include it.
  if (!label.toUpperCase().includes('SMOKE') && !label.toUpperCase().includes('TEST')) {
    throw new Error(
      `smokeProjectLabel must contain SMOKE or TEST (got "${label}") — refusing production projects.`,
    );
  }
}
