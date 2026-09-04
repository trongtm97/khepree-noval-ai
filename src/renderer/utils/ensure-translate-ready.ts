import type { TranslateEnsureReadyResponse } from '@shared/schemas/translate-readiness';

export type EnsureCtaAction =
  | 'check_google'
  | 'open_notebook'
  | 'open_ai_memory'
  | 'retry_connect'
  | 'relink_notebook';

export interface EnsureCta {
  action: EnsureCtaAction;
  labelKey:
    | 'translation.ctaCheckGoogle'
    | 'translation.ctaOpenNotebook'
    | 'translation.ctaOpenAiMemory'
    | 'translation.ctaRetryConnect'
    | 'translation.ctaRelinkNotebook';
  accountId: string | null;
}

export function mapEnsureActions(
  result: Pick<TranslateEnsureReadyResponse, 'actions' | 'workerAccountId'>,
): EnsureCta[] {
  const accountId = result.workerAccountId;
  const out: EnsureCta[] = [];
  for (const action of result.actions) {
    if (action === 'check_google') {
      out.push({
        action,
        labelKey: 'translation.ctaCheckGoogle',
        accountId,
      });
    } else if (action === 'open_notebook') {
      out.push({
        action,
        labelKey: 'translation.ctaOpenNotebook',
        accountId,
      });
    } else if (action === 'retry_connect') {
      out.push({
        action,
        labelKey: 'translation.ctaRetryConnect',
        accountId,
      });
    } else if (action === 'relink_notebook') {
      out.push({
        action,
        labelKey: 'translation.ctaRelinkNotebook',
        accountId,
      });
    } else {
      out.push({
        action,
        labelKey: 'translation.ctaOpenAiMemory',
        accountId,
      });
    }
  }
  return out;
}

export async function runEnsureTranslateReady(input: {
  projectId: string;
  accountId?: string | null;
}): Promise<TranslateEnsureReadyResponse> {
  return window.khepreeNovelAI.notebook.ensureForTranslate(input);
}
