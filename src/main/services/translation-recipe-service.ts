import {
  BUILTIN_TRANSLATION_RECIPES,
  getBuiltinRecipe,
  isBuiltinRecipeId,
  mergeRecipeConfig,
  TranslationRecipeConfigSchema,
  type TranslationRecipeConfig,
  type TranslationRecipeOverrideDto,
} from '@shared/constants/translation-recipe-defs';
import {
  DEFAULT_TRANSLATION_RECIPE_ID,
  TRANSLATION_RECIPE_APP_META_KEYS,
  TRANSLATION_RECIPE_CONFIG_VERSION,
  type TranslationRecipeMode,
} from '@shared/constants/translation-recipes';
import {
  parseProjectStyleConfig,
  type ProjectStyleConfig,
} from '@shared/constants/project-style-config';
import {
  parseRecipeImport,
  RecipeImportError,
  TranslationRecipeOverrideSchema,
  type RecipeExportEnvelope,
  type RecipeListItemDto,
  type RecipeResolveResultDto,
  type TranslationRecipeConfigDto,
} from '@shared/schemas/translation-recipe';
import { getDatabase } from '../db/connection';
import { utcNow } from '../db/utils/timestamps';

function parseConfig(json: string): TranslationRecipeConfig {
  return TranslationRecipeConfigSchema.parse(JSON.parse(json) as unknown) as TranslationRecipeConfig;
}

function toConfig(dto: TranslationRecipeConfigDto): TranslationRecipeConfig {
  return TranslationRecipeConfigSchema.parse(dto) as TranslationRecipeConfig;
}

function localizeName(
  recipe: { nameEn: string; nameVi: string },
  locale: 'en' | 'vi',
): string {
  return locale === 'vi' ? recipe.nameVi : recipe.nameEn;
}

export class TranslationRecipeService {
  list(locale: 'en' | 'vi' = 'en'): RecipeListItemDto[] {
    const db = getDatabase();
    const defaultId = this.getDefaultRecipeId();
    const builtins: RecipeListItemDto[] = BUILTIN_TRANSLATION_RECIPES.map((r) => ({
      id: r.id,
      name: localizeName(r, locale),
      nameEn: r.nameEn,
      nameVi: r.nameVi,
      description: locale === 'vi' ? r.descriptionVi : r.descriptionEn,
      descriptionEn: r.descriptionEn,
      descriptionVi: r.descriptionVi,
      tradeoffEn: r.tradeoffEn,
      tradeoffVi: r.tradeoffVi,
      mode: r.mode,
      version: r.version,
      isBuiltin: true,
      isDefault: r.id === defaultId,
      config: r.config,
      clonedFromId: null,
      updatedAt: null,
    }));

    const user = db.translationRecipes.listUserRecipes().map((row) => {
      const config = parseConfig(row.config_json);
      return {
        id: row.id,
        name: row.name,
        nameEn: null,
        nameVi: null,
        description: row.description,
        descriptionEn: null,
        descriptionVi: null,
        tradeoffEn: null,
        tradeoffVi: null,
        mode: row.mode,
        version: row.version,
        isBuiltin: false,
        isDefault: row.id === defaultId,
        config,
        clonedFromId: row.cloned_from_id,
        updatedAt: row.updated_at,
      } satisfies RecipeListItemDto;
    });

    return [...builtins, ...user];
  }

  getDefaultRecipeId(): string {
    const stored = getDatabase().appMeta.get(
      TRANSLATION_RECIPE_APP_META_KEYS.defaultRecipeId,
    );
    if (stored && this.recipeExists(stored)) return stored;
    return DEFAULT_TRANSLATION_RECIPE_ID;
  }

  setDefaultRecipeId(id: string): { ok: true; id: string } {
    if (!this.recipeExists(id)) {
      throw new Error(`Recipe not found: ${id}`);
    }
    getDatabase().appMeta.set(TRANSLATION_RECIPE_APP_META_KEYS.defaultRecipeId, id);
    return { ok: true, id };
  }

  recipeExists(id: string): boolean {
    if (isBuiltinRecipeId(id)) return true;
    return getDatabase().translationRecipes.getById(id) != null;
  }

  getConfigById(id: string): { id: string; mode: TranslationRecipeMode; config: TranslationRecipeConfig; version: string; name: string } {
    const builtin = getBuiltinRecipe(id);
    if (builtin) {
      return {
        id: builtin.id,
        mode: builtin.mode,
        config: builtin.config,
        version: builtin.version,
        name: builtin.nameEn,
      };
    }
    const row = getDatabase().translationRecipes.getById(id);
    if (!row) throw new Error(`Recipe not found: ${id}`);
    return {
      id: row.id,
      mode: row.mode,
      config: parseConfig(row.config_json),
      version: row.version,
      name: row.name,
    };
  }

  clone(input: {
    cloneFromId: string;
    name: string;
    description?: string;
  }): RecipeListItemDto {
    const source = this.getConfigById(input.cloneFromId);
    const db = getDatabase();
    const row = db.translationRecipes.create({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      mode: source.mode,
      version: source.version,
      configJson: JSON.stringify(source.config),
      clonedFromId: source.id,
    });
    return this.list().find((r) => r.id === row.id)!;
  }

  create(input: {
    name: string;
    description?: string;
    cloneFromId?: string;
    config?: TranslationRecipeConfigDto;
  }): RecipeListItemDto {
    if (input.cloneFromId) {
      return this.clone({
        cloneFromId: input.cloneFromId,
        name: input.name,
        description: input.description,
      });
    }
    const base = getBuiltinRecipe(DEFAULT_TRANSLATION_RECIPE_ID)!;
    const config = toConfig(input.config ?? base.config);
    const row = getDatabase().translationRecipes.create({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      mode: config.mode,
      version: '1.0.0-custom',
      configJson: JSON.stringify(config),
      clonedFromId: null,
    });
    return this.list().find((r) => r.id === row.id)!;
  }

  update(input: {
    id: string;
    name?: string;
    description?: string | null;
    config?: TranslationRecipeConfigDto;
  }): RecipeListItemDto {
    if (isBuiltinRecipeId(input.id)) {
      throw new Error('Built-in recipes cannot be edited. Clone first.');
    }
    const parsedConfig = input.config ? toConfig(input.config) : undefined;
    const configJson = parsedConfig ? JSON.stringify(parsedConfig) : undefined;
    const mode = parsedConfig?.mode;
    const row = getDatabase().translationRecipes.update(input.id, {
      name: input.name,
      description: input.description,
      configJson,
      mode,
    });
    if (!row) throw new Error(`Recipe not found or not editable: ${input.id}`);
    return this.list().find((r) => r.id === row.id)!;
  }

  delete(id: string): { ok: true } {
    if (isBuiltinRecipeId(id)) {
      throw new Error('Built-in recipes cannot be deleted.');
    }
    const ok = getDatabase().translationRecipes.softDelete(id);
    if (!ok) throw new Error(`Recipe not found: ${id}`);
    if (this.getDefaultRecipeId() === id) {
      this.setDefaultRecipeId(DEFAULT_TRANSLATION_RECIPE_ID);
    }
    return { ok: true };
  }

  exportRecipe(id: string): RecipeExportEnvelope {
    const source = this.getConfigById(id);
    return {
      kind: 'khepree-translation-recipe',
      schemaVersion: TRANSLATION_RECIPE_CONFIG_VERSION,
      exportedAt: utcNow(),
      recipe: {
        name: source.name,
        basedOnMode: source.mode,
        config: source.config,
      },
    };
  }

  importRecipe(payload: unknown, name?: string): RecipeListItemDto {
    let envelope;
    try {
      envelope = parseRecipeImport(payload);
    } catch (err) {
      if (err instanceof RecipeImportError) throw err;
      throw new RecipeImportError(
        err instanceof Error ? err.message : 'Invalid recipe JSON',
        'INVALID_SCHEMA',
      );
    }
    return this.create({
      name: name?.trim() || envelope.recipe.name,
      description: envelope.recipe.description,
      config: envelope.recipe.config,
    });
  }

  createCampaign(input: { title: string; recipeId: string }) {
    const source = this.getConfigById(input.recipeId);
    const snapshot = {
      recipeId: source.id,
      version: source.version,
      mode: source.mode,
      name: source.name,
      config: source.config,
      snapshottedAt: utcNow(),
    };
    const row = getDatabase().translationCampaigns.create({
      title: input.title.trim(),
      recipeId: source.id,
      recipeSnapshotJson: JSON.stringify(snapshot),
    });
    return {
      campaignId: row.id,
      title: row.title,
      recipeId: row.recipe_id,
      snapshot,
      status: row.status,
    };
  }

  getCampaign(campaignId: string) {
    const row = getDatabase().translationCampaigns.getById(campaignId);
    if (!row) throw new Error(`Campaign not found: ${campaignId}`);
    const projects = getDatabase().translationCampaigns.listProjects(campaignId);
    return {
      campaignId: row.id,
      title: row.title,
      recipeId: row.recipe_id,
      snapshot: JSON.parse(row.recipe_snapshot_json) as {
        recipeId: string;
        version: string;
        mode: TranslationRecipeMode;
        name: string;
        config: TranslationRecipeConfig;
        snapshottedAt: string;
      },
      status: row.status,
      projects: projects.map((p) => ({
        projectId: p.project_id,
        override: p.override_json
          ? TranslationRecipeOverrideSchema.parse(JSON.parse(p.override_json))
          : null,
      })),
    };
  }

  listCampaigns() {
    return getDatabase().translationCampaigns.list().map((row) => ({
      campaignId: row.id,
      title: row.title,
      recipeId: row.recipe_id,
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }

  setCampaignProjectOverride(input: {
    campaignId: string;
    projectId: string;
    override: TranslationRecipeOverrideDto | null;
  }) {
    const campaign = getDatabase().translationCampaigns.getById(input.campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${input.campaignId}`);
    if (!getDatabase().projects.getById(input.projectId)) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const overrideJson =
      input.override == null
        ? null
        : JSON.stringify(TranslationRecipeOverrideSchema.parse(input.override));
    getDatabase().translationCampaigns.setProjectOverride({
      campaignId: input.campaignId,
      projectId: input.projectId,
      overrideJson,
    });
    return this.getCampaign(input.campaignId);
  }

  setProjectRecipe(input: {
    projectId: string;
    recipeId?: string | null;
    override?: TranslationRecipeOverrideDto | null;
  }) {
    const db = getDatabase();
    const project = db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const settings = db.getConnection()
      .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
      .get(input.projectId) as { style_config: string | null } | undefined;
    const base = parseProjectStyleConfig(settings?.style_config);
    if (input.recipeId !== undefined) {
      if (input.recipeId === null) {
        delete base.recipeId;
      } else {
        if (!this.recipeExists(input.recipeId)) {
          throw new Error(`Recipe not found: ${input.recipeId}`);
        }
        base.recipeId = input.recipeId;
      }
    }
    if (input.override !== undefined) {
      if (input.override === null) {
        delete base.recipeOverride;
      } else {
        base.recipeOverride = TranslationRecipeOverrideSchema.parse(input.override);
      }
    }
    db.getConnection()
      .prepare(`UPDATE project_settings SET style_config = ?, updated_at = ? WHERE project_id = ?`)
      .run(JSON.stringify(base), utcNow(), input.projectId);
    return this.resolveForProject(input.projectId);
  }

  /**
   * Resolve effective recipe for a project.
   * Priority: project override on chosen recipe > project recipeId > app default > BALANCED.
   * When campaignId provided: campaign snapshot + campaign project override.
   */
  resolveForProject(
    projectId: string,
    options?: { campaignId?: string },
  ): RecipeResolveResultDto {
    if (options?.campaignId) {
      const campaign = this.getCampaign(options.campaignId);
      const link = campaign.projects.find((p) => p.projectId === projectId);
      const config = mergeRecipeConfig(campaign.snapshot.config, link?.override ?? null);
      return {
        recipeId: campaign.snapshot.recipeId,
        mode: campaign.snapshot.mode,
        source: link?.override ? 'project_override' : 'campaign_snapshot',
        config,
        overrideApplied: Boolean(link?.override),
      };
    }

    const db = getDatabase();
    const settings = db.getConnection()
      .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
      .get(projectId) as { style_config: string | null } | undefined;
    const style = parseProjectStyleConfig(settings?.style_config) as ProjectStyleConfig & {
      recipeId?: string;
      recipeOverride?: TranslationRecipeOverrideDto;
    };

    const recipeId =
      (typeof style.recipeId === 'string' && style.recipeId) || this.getDefaultRecipeId();
    const base = this.getConfigById(recipeId);
    const override =
      style.recipeOverride && typeof style.recipeOverride === 'object'
        ? TranslationRecipeOverrideSchema.parse(style.recipeOverride)
        : null;
    const config = mergeRecipeConfig(base.config, override);
    return {
      recipeId: base.id,
      mode: base.mode,
      source: override ? 'project_override' : isBuiltinRecipeId(base.id) ? 'builtin' : 'user',
      config,
      overrideApplied: Boolean(override),
    };
  }
}

let service: TranslationRecipeService | null = null;

export function getTranslationRecipeService(): TranslationRecipeService {
  if (!service) service = new TranslationRecipeService();
  return service;
}

export function resetTranslationRecipeServiceForTests(): void {
  service = null;
}
