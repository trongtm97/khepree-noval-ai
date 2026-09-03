import {
  CAMPAIGN_PIPELINE_STAGES,
  type CampaignPipelineStage,
} from '../constants/campaign-pipeline';

/** User-facing stage keys — i18n under production.stage.* (no ops jargon). */
export const CAMPAIGN_STAGE_UI_KEYS: Record<CampaignPipelineStage, string> = {
  INTAKE: 'intake',
  PREFLIGHT: 'preflight',
  BOOTSTRAP: 'bootstrap',
  TRANSLATION: 'translation',
  QA_REPAIR: 'qaRepair',
  WHOLE_BOOK_AUDIT: 'bookReview',
  DELIVERY: 'delivery',
};

export function campaignStageProgressPercent(
  stage: string | null | undefined,
): number {
  if (!stage) return 0;
  const idx = (CAMPAIGN_PIPELINE_STAGES as readonly string[]).indexOf(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / CAMPAIGN_PIPELINE_STAGES.length) * 100);
}

/** ETA only when history exists and max minutes present. */
export function shouldShowCampaignEta(input: {
  estimateBasis: 'insufficient_history' | 'local_history';
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
}): boolean {
  if (input.estimateBasis === 'insufficient_history') return false;
  if (input.estimatedMinutesMax == null) return false;
  if (input.estimatedMinutesMax <= 0) return false;
  return true;
}

export function shortenAccountLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('@')) {
    const [user, domain] = s.split('@');
    if (!user || !domain) return s.slice(0, 18);
    const shortUser = user.length > 6 ? `${user.slice(0, 4)}…` : user;
    return `${shortUser}@${domain.slice(0, 8)}`;
  }
  return s.length > 18 ? `${s.slice(0, 16)}…` : s;
}

export function shortenProviderLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const map: Record<string, string> = {
    GEMINI: 'Gemini',
    CHATGPT: 'ChatGPT',
    META_AI: 'Meta AI',
    NOTEBOOKLM: 'NotebookLM',
  };
  return map[s.toUpperCase()] ?? (s.length > 16 ? `${s.slice(0, 14)}…` : s);
}
