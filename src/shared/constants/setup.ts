/** First-run onboarding step ids (order fixed). */
export const SETUP_WIZARD_STEPS = [
  'welcome',
  'googleAccount',
  'testGemini',
  'createProject',
] as const;

export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number];

/** Legacy steps from older installs — mapped when reading status. */
export const LEGACY_SETUP_STEPS = [
  'storage',
  'drive',
  'importNovel',
  'notebook',
  'ready',
] as const;

export const SETUP_META_KEYS = {
  completed: 'setup.completed',
  step: 'setup.step',
  skippedDrive: 'setup.skippedDrive',
  /** User chose "skip & explore" — enter app without marking setup complete. */
  explored: 'setup.explored',
} as const;

export function normalizeSetupStep(raw: string | null | undefined): SetupWizardStep {
  if (raw && (SETUP_WIZARD_STEPS as readonly string[]).includes(raw)) {
    return raw as SetupWizardStep;
  }
  switch (raw) {
    case 'storage':
    case 'drive':
      return 'googleAccount';
    case 'importNovel':
    case 'notebook':
    case 'ready':
      return 'createProject';
    default:
      return 'welcome';
  }
}
