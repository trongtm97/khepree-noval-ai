import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  getTranslationRecipeService,
  resetTranslationRecipeServiceForTests,
} from '@main/services/translation-recipe-service';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';
import { BUILTIN_TRANSLATION_RECIPES } from '@shared/constants/translation-recipe-defs';
import { parseRecipeImport, RecipeImportError } from '@shared/schemas/translation-recipe';
import { en } from '@renderer/i18n/locales/en';
import { vi } from '@renderer/i18n/locales/vi';

describe('translation recipes', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-recipe-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetTranslationRecipeServiceForTests();
  });

  afterEach(() => {
    closeDatabase();
    resetTranslationRecipeServiceForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('lists immutable built-ins and rejects delete/edit', () => {
    const service = getTranslationRecipeService();
    const list = service.list('en');
    expect(list.filter((r) => r.isBuiltin)).toHaveLength(3);
    expect(BUILTIN_TRANSLATION_RECIPES.map((r) => r.id).sort()).toEqual(
      list.filter((r) => r.isBuiltin).map((r) => r.id).sort(),
    );

    expect(() => service.delete(BUILTIN_RECIPE_IDS.QUICK)).toThrow(/cannot be deleted/i);
    expect(() =>
      service.update({
        id: BUILTIN_RECIPE_IDS.BALANCED,
        name: 'hacked',
      }),
    ).toThrow(/cannot be edited/i);

    // Built-ins still present after failed mutate
    expect(service.list('en').filter((r) => r.isBuiltin)).toHaveLength(3);
  });

  it('clones, sets default, campaign snapshot + project override', () => {
    const service = getTranslationRecipeService();
    const cloned = service.clone({
      cloneFromId: BUILTIN_RECIPE_IDS.PUBLICATION,
      name: 'My Pub',
    });
    expect(cloned.isBuiltin).toBe(false);
    expect(cloned.config.wholeBookAudit).toBe(true);

    service.setDefaultRecipeId(cloned.id);
    expect(service.getDefaultRecipeId()).toBe(cloned.id);

    const campaign = service.createCampaign({
      title: 'Wave 1',
      recipeId: cloned.id,
    });
    expect(campaign.snapshot.config.mode).toBe('PUBLICATION');
    expect(campaign.snapshot.config.maxRepairAttempts).toBe(4);

    // Mutate personal recipe after snapshot — campaign stays frozen
    service.update({
      id: cloned.id,
      config: { ...cloned.config, maxRepairAttempts: 9 },
    });
    const frozen = service.getCampaign(campaign.campaignId);
    expect(frozen.snapshot.config.maxRepairAttempts).toBe(4);

    const db = getDatabase();
    const project = db.projects.create({ title: 'Story A' });
    service.setCampaignProjectOverride({
      campaignId: campaign.campaignId,
      projectId: project.id,
      override: { maxRepairAttempts: 1 },
    });
    const resolved = service.resolveForProject(project.id, {
      campaignId: campaign.campaignId,
    });
    expect(resolved.config.maxRepairAttempts).toBe(1);
    expect(resolved.overrideApplied).toBe(true);
    expect(resolved.source).toBe('project_override');
  });

  it('rejects malicious or invalid recipe JSON import', () => {
    expect(() =>
      parseRecipeImport({
        kind: 'khepree-translation-recipe',
        schemaVersion: 1,
        recipe: {
          name: 'evil',
          config: BUILTIN_TRANSLATION_RECIPES[0].config,
          cookie: 'session=abc',
        },
      }),
    ).toThrow(RecipeImportError);

    expect(() =>
      parseRecipeImport({
        kind: 'khepree-translation-recipe',
        schemaVersion: 1,
        recipe: {
          name: 'pathy',
          config: {
            ...BUILTIN_TRANSLATION_RECIPES[0].config,
            exportFormatHints: ['C:\\Users\\me\\Chrome\\User Data'],
          },
        },
      }),
    ).toThrow(RecipeImportError);

    expect(() => parseRecipeImport({ kind: 'nope' })).toThrow(RecipeImportError);

    const service = getTranslationRecipeService();
    expect(() =>
      service.importRecipe({
        kind: 'khepree-translation-recipe',
        schemaVersion: 1,
        recipe: {
          name: 'ok-looking',
          apiKey: 'sk-secret',
          config: BUILTIN_TRANSLATION_RECIPES[1].config,
        },
      }),
    ).toThrow(/forbidden field/i);
  });

  it('locale switch keeps recipe id selection (VI/EN names differ)', () => {
    const service = getTranslationRecipeService();
    service.setDefaultRecipeId(BUILTIN_RECIPE_IDS.QUICK);
    const enList = service.list('en');
    const viList = service.list('vi');
    const enQuick = enList.find((r) => r.id === BUILTIN_RECIPE_IDS.QUICK)!;
    const viQuick = viList.find((r) => r.id === BUILTIN_RECIPE_IDS.QUICK)!;
    expect(enQuick.name).toBe('Quick');
    expect(viQuick.name).toBe('Nhanh');
    expect(service.getDefaultRecipeId()).toBe(BUILTIN_RECIPE_IDS.QUICK);

    // i18n catalogs share recipe keys
    const enKeys = Object.keys(en.settings).filter((k) => k.startsWith('recipe'));
    const viKeys = Object.keys(vi.settings).filter((k) => k.startsWith('recipe'));
    expect(enKeys.sort()).toEqual(viKeys.sort());
  });

  it('imports valid export envelope', () => {
    const service = getTranslationRecipeService();
    const envelope = service.exportRecipe(BUILTIN_RECIPE_IDS.BALANCED);
    const imported = service.importRecipe(envelope, 'Imported Balanced');
    expect(imported.isBuiltin).toBe(false);
    expect(imported.name).toBe('Imported Balanced');
    expect(imported.config.mode).toBe('BALANCED');
  });
});
