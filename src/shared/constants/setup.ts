/** First-run setup wizard step ids (order fixed). */
export const SETUP_WIZARD_STEPS = [
  'welcome',
  'storage',
  'drive',
  'googleAccount',
  'importNovel',
  'notebook',
  'testGemini',
  'ready',
] as const;

export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number];

export const SETUP_META_KEYS = {
  completed: 'setup.completed',
  step: 'setup.step',
  skippedDrive: 'setup.skippedDrive',
} as const;
