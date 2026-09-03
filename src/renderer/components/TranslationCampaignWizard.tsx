import { useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignPlanDto } from '@shared/schemas/translation-campaign';
import type { RecipeListItemDto } from '@shared/schemas/translation-recipe';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';
import { resolveUiLocale } from '@shared/types/ui-locale';
import { useLocaleStore, useT } from '../i18n';
import { Button, Input, Select } from './ui';

export interface TranslationCampaignWizardProps {
  projects: { id: string; title: string }[];
  initialSelectedIds?: string[];
  onClose: () => void;
  onStarted?: () => void;
  onError: (message: string) => void;
}

type Step = 'select' | 'plan' | 'done';

function formatChars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function newStartToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `start-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TranslationCampaignWizard({
  projects,
  initialSelectedIds,
  onClose,
  onStarted,
  onError,
}: TranslationCampaignWizardProps) {
  const t = useT();
  const preference = useLocaleStore((s) => s.preference);
  const locale = resolveUiLocale(preference);
  const [step, setStep] = useState<Step>('select');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(() => t('campaignPlanner.defaultTitle'));
  const [recipeId, setRecipeId] = useState<string>(BUILTIN_RECIPE_IDS.BALANCED);
  const [recipes, setRecipes] = useState<RecipeListItemDto[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of projects) {
      init[p.id] = initialSelectedIds?.includes(p.id) ?? false;
    }
    return init;
  });
  const [plan, setPlan] = useState<CampaignPlanDto | null>(null);
  const [startSummary, setStartSummary] = useState<string | null>(null);
  const startTokenRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    void window.khepreeNovelAI.translationRecipe
      .list({ locale })
      .then((res) => {
        setRecipes(res.recipes);
        setRecipeId(res.defaultRecipeId || BUILTIN_RECIPE_IDS.BALANCED);
      })
      .catch((err: unknown) => {
        onError(err instanceof Error ? err.message : t('campaignPlanner.loadRecipesFailed'));
      });
  }, [locale, onError, t]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const recipeOptions = useMemo(
    () =>
      recipes.map((r) => ({
        value: r.id,
        label: r.isBuiltin ? `${r.name} (${r.mode})` : r.name,
      })),
    [recipes],
  );

  const runPreflightCreate = async () => {
    setBusy(true);
    try {
      const { plan: next } = await window.khepreeNovelAI.translationCampaign.create({
        title: title.trim() || t('campaignPlanner.defaultTitle'),
        recipeId,
        projectIds: selectedIds,
      });
      setPlan(next);
      setStep('plan');
      startTokenRef.current = null;
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('campaignPlanner.preflightFailed'));
    } finally {
      setBusy(false);
    }
  };

  const refreshPlan = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const { plan: next } = await window.khepreeNovelAI.translationCampaign.preflight(
        plan.campaignId,
      );
      setPlan(next);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('campaignPlanner.preflightFailed'));
    } finally {
      setBusy(false);
    }
  };

  const startCampaign = async () => {
    if (!plan || startingRef.current) return;
    startingRef.current = true;
    setBusy(true);
    try {
      if (!startTokenRef.current) {
        startTokenRef.current = newStartToken();
      }
      const token = startTokenRef.current;
      const { result } = await window.khepreeNovelAI.translationCampaign.start({
        campaignId: plan.campaignId,
        startToken: token,
      });
      setPlan(result.plan);
      setStartSummary(
        t('campaignPlanner.startSummary', {
          created: String(result.jobsCreated),
          reused: String(result.jobsReused),
          started: String(result.projectsStarted),
          skipped: String(result.projectsSkipped),
          replay: result.idempotentReplay ? t('campaignPlanner.idempotentReplay') : '',
        }),
      );
      setStep('done');
      onStarted?.();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('campaignPlanner.startFailed'));
      startingRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card import-wizard translation-campaign-wizard">
      <div className="import-wizard-header">
        <h3>{t('campaignPlanner.title')}</h3>
        <p className="muted">{t('campaignPlanner.subtitle')}</p>
      </div>

      <div className="import-wizard-body">
        {step === 'select' ? (
          <>
            <p className="muted">{t('campaignPlanner.lead')}</p>
            <label className="field">
              <span>{t('campaignPlanner.campaignTitle')}</span>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>{t('campaignPlanner.recipe')}</span>
              <Select
                value={recipeId}
                disabled={busy || recipeOptions.length === 0}
                onChange={(e) => {
                  setRecipeId(e.target.value);
                }}
              >
                {recipeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
            <div className="campaign-project-list">
              <div className="campaign-project-list__head">
                <strong>{t('campaignPlanner.projects')}</strong>
                <span className="muted">
                  {t('campaignPlanner.selectedCount', { count: String(selectedIds.length) })}
                </span>
              </div>
              {projects.length === 0 ? (
                <p className="muted">{t('campaignPlanner.noProjects')}</p>
              ) : (
                <ul>
                  {projects.map((p) => (
                    <li key={p.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[p.id])}
                          disabled={busy}
                          onChange={(e) => {
                            setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }));
                          }}
                        />
                        <span>{p.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="import-wizard-actions">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void runPreflightCreate();
                }}
              >
                {busy ? t('campaignPlanner.planning') : t('campaignPlanner.buildPlan')}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'plan' && plan ? (
          <>
            <div className="campaign-plan-summary">
              <p>
                <strong>{plan.title}</strong>
                {' · '}
                {plan.recipeName} ({plan.recipeMode})
              </p>
              <p className="muted">
                {t('campaignPlanner.estimateLine', {
                  runnable: String(plan.estimate.runnableCount),
                  attention: String(plan.estimate.needsAttentionCount),
                  chapters: String(plan.estimate.chaptersToTranslate),
                  chars: formatChars(plan.estimate.approximateChars),
                  rounds: String(plan.estimate.relativeProcessingRounds),
                })}
              </p>
              {plan.estimate.estimateBasis === 'local_history' &&
              plan.estimate.estimatedMinutesMin != null &&
              plan.estimate.estimatedMinutesMax != null ? (
                <p className="muted">
                  {t('campaignPlanner.timeEstimate', {
                    min: String(plan.estimate.estimatedMinutesMin),
                    max: String(plan.estimate.estimatedMinutesMax),
                  })}
                </p>
              ) : (
                <p className="muted">{t('campaignPlanner.timeInsufficient')}</p>
              )}
              <p className="muted">
                {t('campaignPlanner.capabilityLine', {
                  maxProjects: String(plan.estimate.capabilityMaxProjects),
                  maxConcurrent: String(plan.estimate.capabilityMaxConcurrentNovels),
                })}
              </p>
              {!plan.canStart ? (
                <p className="error-text">{plan.startBlockedReason}</p>
              ) : null}
            </div>
            <ul className="campaign-plan-projects">
              {plan.projects.map((p) => (
                <li key={p.projectId}>
                  <strong>{p.title}</strong>
                  <span className="muted">
                    {' '}
                    · {p.status}
                    {p.blockerCode ? ` · ${p.blockerCode}` : ''}
                    {` · ${p.chaptersUntranslated}/${p.chaptersTotal} · ~${formatChars(p.approximateCharsRemaining)}`}
                  </span>
                  {p.blockerMessage ? <div className="muted">{p.blockerMessage}</div> : null}
                </li>
              ))}
            </ul>
            <div className="import-wizard-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setStep('select');
                  setPlan(null);
                }}
              >
                {t('campaignPlanner.back')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void refreshPlan();
                }}
              >
                {t('campaignPlanner.refreshPlan')}
              </Button>
              <Button
                variant="primary"
                disabled={busy || !plan.canStart}
                onClick={() => {
                  void startCampaign();
                }}
              >
                {busy ? t('campaignPlanner.starting') : t('campaignPlanner.start')}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <p>{startSummary}</p>
            <p className="muted">{t('campaignPlanner.doneHint')}</p>
            <div className="import-wizard-actions">
              <Button variant="primary" onClick={onClose}>
                {t('actions.close')}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
