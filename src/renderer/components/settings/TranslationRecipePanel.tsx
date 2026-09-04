import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecipeListItemDto } from '@shared/schemas/translation-recipe';
import type { TranslationRecipeMode } from '@shared/constants/translation-recipes';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';
import { resolveUiLocale } from '@shared/types/ui-locale';
import { useLocaleStore, useT } from '../../i18n';
import { Button, Input } from '../ui';
import { SettingsDisclosure } from './SettingsDisclosure';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsStatus } from './SettingsStatus';
import { useSettingsFeedback } from './useSettingsFeedback';

const MODE_ORDER: TranslationRecipeMode[] = ['QUICK', 'BALANCED', 'PUBLICATION'];

export function TranslationRecipePanel(props: {
  onLoadError: (msg: string | null) => void;
}) {
  const t = useT();
  const preference = useLocaleStore((s) => s.preference);
  const locale = resolveUiLocale(preference);
  const { showSaved } = useSettingsFeedback();
  const [recipes, setRecipes] = useState<RecipeListItemDto[]>([]);
  const [defaultId, setDefaultId] = useState<string>(BUILTIN_RECIPE_IDS.BALANCED);
  const [saving, setSaving] = useState(false);
  const [importText, setImportText] = useState('');
  const [cloneName, setCloneName] = useState('');

  const refresh = useCallback(async () => {
    const res = await window.khepreeNovelAI.translationRecipe.list({ locale });
    setRecipes(res.recipes);
    setDefaultId(res.defaultRecipeId);
    props.onLoadError(null);
  }, [locale, props]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh, props]);

  const builtins = useMemo(
    () =>
      MODE_ORDER.map((mode) => recipes.find((r) => r.isBuiltin && r.mode === mode)).filter(
        (r): r is RecipeListItemDto => Boolean(r),
      ),
    [recipes],
  );
  const personal = useMemo(() => recipes.filter((r) => !r.isBuiltin), [recipes]);
  const selected = recipes.find((r) => r.id === defaultId) ?? builtins[1] ?? null;

  const setDefault = async (id: string) => {
    setSaving(true);
    try {
      await window.khepreeNovelAI.translationRecipe.setDefault({ id });
      setDefaultId(id);
      showSaved(t('settings.recipeDefaultSaved'));
      await refresh();
    } catch (err: unknown) {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const cloneSelected = async () => {
    if (!selected) return;
    const name = cloneName.trim() || `${selected.name} (copy)`;
    setSaving(true);
    try {
      const { recipe } = await window.khepreeNovelAI.translationRecipe.clone({
        cloneFromId: selected.id,
        name,
      });
      setCloneName('');
      await window.khepreeNovelAI.translationRecipe.setDefault({ id: recipe.id });
      showSaved(t('settings.recipeCloned'));
      await refresh();
    } catch (err: unknown) {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const exportSelected = async () => {
    if (!selected) return;
    try {
      const { envelope } = await window.khepreeNovelAI.translationRecipe.export(selected.id);
      await navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
      showSaved(t('settings.recipeExported'));
    } catch (err: unknown) {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  const importRecipe = async () => {
    setSaving(true);
    try {
      const payload = JSON.parse(importText) as unknown;
      await window.khepreeNovelAI.translationRecipe.import({ payload });
      setImportText('');
      showSaved(t('settings.recipeImported'));
      await refresh();
    } catch (err: unknown) {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const deletePersonal = async (id: string) => {
    setSaving(true);
    try {
      await window.khepreeNovelAI.translationRecipe.delete(id);
      showSaved(t('settings.recipeDeleted'));
      await refresh();
    } catch (err: unknown) {
      props.onLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const tradeoff = (r: RecipeListItemDto) =>
    locale === 'vi' ? r.tradeoffVi ?? r.tradeoffEn : r.tradeoffEn ?? r.tradeoffVi;

  const description = (r: RecipeListItemDto) =>
    locale === 'vi'
      ? r.descriptionVi ?? r.description ?? r.descriptionEn
      : r.descriptionEn ?? r.description ?? r.descriptionVi;

  return (
    <SettingsSection
      title={t('settings.recipeTitle')}
      description={t('settings.recipeBody')}
    >
      <SettingsStatus tone="info" live="polite">
        {t('settings.recipeCostDisclaimer')}
      </SettingsStatus>

      <fieldset className="settings-mode-fieldset">
        <legend className="settings-mode-fieldset__legend">{t('settings.recipeModeLabel')}</legend>
        <div className="settings-mode-cards">
          {builtins.map((r) => (
            <label
              key={r.id}
              className={`settings-mode-card${defaultId === r.id ? ' is-active' : ''}`}
            >
              <input
                type="radio"
                name="translation-recipe-mode"
                checked={defaultId === r.id}
                disabled={saving}
                onChange={() => {
                  void setDefault(r.id);
                }}
              />
              <span className="settings-mode-card__title">{r.name}</span>
              <span className="settings-mode-card__desc muted">{description(r)}</span>
              <span className="settings-mode-card__desc muted">{tradeoff(r)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {selected ? (
        <SettingsGroup>
          <SettingsStatus tone="info">
            {t('settings.recipeSelectedSummary', {
              name: selected.name,
              version: selected.version,
              repairs: String(selected.config.maxRepairAttempts),
              qa: selected.config.qaLevel,
            })}
          </SettingsStatus>
          <div className="btn-row">
            <Input
              aria-label={t('settings.recipeCloneName')}
              placeholder={t('settings.recipeCloneName')}
              value={cloneName}
              onChange={(e) => {
                setCloneName(e.target.value);
              }}
            />
            <Button variant="secondary" disabled={saving} onClick={() => void cloneSelected()}>
              {t('settings.recipeClone')}
            </Button>
            <Button variant="secondary" disabled={saving} onClick={() => void exportSelected()}>
              {t('settings.recipeExport')}
            </Button>
          </div>
        </SettingsGroup>
      ) : null}

      {personal.length > 0 ? (
        <SettingsGroup>
          <p className="muted">{t('settings.recipePersonalHeading')}</p>
          <ul className="settings-recipe-list">
            {personal.map((r) => (
              <li key={r.id}>
                <label>
                  <input
                    type="radio"
                    name="translation-recipe-personal"
                    checked={defaultId === r.id}
                    disabled={saving}
                    onChange={() => {
                      void setDefault(r.id);
                    }}
                  />
                  {r.name}
                  {r.isDefault ? ` · ${t('settings.recipeDefaultBadge')}` : ''}
                </label>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    void deletePersonal(r.id);
                  }}
                >
                  {t('settings.recipeDelete')}
                </Button>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      ) : null}

      <SettingsDisclosure
        title={t('settings.recipeAdvancedTitle')}
        description={t('settings.advancedSectionHelp')}
        defaultOpen={false}
      >
        <p className="muted">{t('settings.recipeAdvancedBody')}</p>
        {selected ? (
          <SettingsGroup>
            <SettingsRow
              label={t('settings.recipeAdvRepair')}
              description={t('settings.recipeAdvRepairHelp')}
              control={<span>{selected.config.maxRepairAttempts}</span>}
            />
            <SettingsRow
              label={t('settings.recipeAdvContinuation')}
              description={t('settings.recipeAdvContinuationHelp')}
              control={<span>{selected.config.maxContinuationAttempts}</span>}
            />
            <SettingsRow
              label={t('settings.recipeAdvQa')}
              description={t('settings.recipeAdvQaHelp')}
              control={<span>{selected.config.qaLevel}</span>}
            />
            <SettingsRow
              label={t('settings.recipeAdvBootstrap')}
              description={t('settings.recipeAdvBootstrapHelp')}
              control={
                <span>
                  {selected.config.bootstrapMode} · {selected.config.bootstrapChapterCount}
                </span>
              }
            />
            <SettingsRow
              label={t('settings.recipeAdvWholeBook')}
              description={t('settings.recipeAdvWholeBookHelp')}
              control={
                <span>
                  {selected.config.wholeBookAudit
                    ? t('settings.recipeYes')
                    : t('settings.recipeNo')}
                </span>
              }
            />
            <SettingsRow
              label={t('settings.recipeAdvProviders')}
              description={t('settings.recipeAdvProvidersHelp')}
              control={
                <span>
                  {selected.config.providerPriority.length > 0
                    ? selected.config.providerPriority.join(', ')
                    : t('settings.recipeProvidersDefault')}
                </span>
              }
            />
          </SettingsGroup>
        ) : null}
        <SettingsGroup>
          <p className="muted">{t('settings.recipeImportHelp')}</p>
          <textarea
            aria-label={t('settings.recipeImport')}
            rows={5}
            className="settings-textarea"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
            }}
          />
          <Button
            variant="secondary"
            disabled={saving || !importText.trim()}
            onClick={() => {
              void importRecipe();
            }}
          >
            {t('settings.recipeImport')}
          </Button>
        </SettingsGroup>
      </SettingsDisclosure>
    </SettingsSection>
  );
}
