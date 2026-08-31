import type { DatabaseManager } from '../db/database-manager';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import {
  AUTO_PREFERENCE_GROUP_ORDER,
  DEFAULT_AI_PREFERENCE,
  type AiPreference,
  type AiProviderPreference,
  isAiPreference,
  pickBestProviderIdForPreference,
  preferenceFromProviderId,
  providerIdsForPreference,
} from '@shared/constants/ai-preference';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';
import {
  isTranslationAiProviderId,
  TRANSLATION_AI_PROVIDER_IDS,
} from '@shared/constants/translation-ai-providers';
import {
  projectUsesGlobalPrimary,
  readProjectAiPreferenceOverride,
} from '@shared/constants/project-style-config';
import type { AiProviderService } from './ai-provider-service';
import { applyRecommendedProviderOrder } from './ai-auto-setup-policy';

export interface ProviderReadinessInput {
  /** Provider id → status is READY and enabled. */
  readyProviderIds: Set<string>;
  /** Provider group has at least one usable account for new jobs. */
  groupAccountReady: Record<AiProviderPreference, boolean>;
}

export function readAiPreference(db: DatabaseManager): AiPreference {
  const raw = db.appMeta.get(AI_ROUTING_META_KEYS.preference);
  if (raw && isAiPreference(raw)) return raw;

  const legacyPrimary = db.appMeta.get(AI_ROUTING_META_KEYS.primaryProviderId);
  if (legacyPrimary && isTranslationAiProviderId(legacyPrimary)) {
    const mapped = preferenceFromProviderId(legacyPrimary);
    if (mapped) return mapped;
  }

  return DEFAULT_AI_PREFERENCE;
}

export function writeAiPreference(db: DatabaseManager, preference: AiPreference): void {
  db.appMeta.set(AI_ROUTING_META_KEYS.preference, preference);
}

export function resolveAutoPrimaryProviderId(
  input: ProviderReadinessInput,
): string | null {
  for (const group of AUTO_PREFERENCE_GROUP_ORDER) {
    if (!input.groupAccountReady[group]) continue;
    const id = pickBestProviderIdForPreference(group, input.readyProviderIds);
    if (id && input.readyProviderIds.has(id)) return id;
    if (id) return id;
  }

  for (const group of AUTO_PREFERENCE_GROUP_ORDER) {
    const id = pickBestProviderIdForPreference(group, input.readyProviderIds);
    if (id) return id;
  }

  return (
    TRANSLATION_AI_PROVIDER_IDS.find((id) => input.readyProviderIds.has(id)) ?? null
  );
}

export function resolvePrimaryForPreference(
  preference: AiProviderPreference,
  input: ProviderReadinessInput,
): string | null {
  const id = pickBestProviderIdForPreference(preference, input.readyProviderIds);
  if (id) return id;
  return providerIdsForPreference(preference)[0] ?? null;
}

export function buildGroupAccountReadinessFromDb(
  db: DatabaseManager,
): Record<AiProviderPreference, boolean> {
  const geminiUsable = db.googleAccounts
    .list()
    .some((row) => row.status === 'READY' || row.status === 'ACTIVE');
  const webApiReady =
    db.aiProviders.getById(AI_PROVIDER_IDS.GEMINI_WEB_API)?.status === 'READY';

  const chatgptReady = db.aiAccounts
    .listByProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT)
    .some((a) => a.status === 'READY');
  const metaReady = db.aiAccounts
    .listByProvider(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI)
    .some((a) => a.status === 'READY');

  return {
    GEMINI: geminiUsable || webApiReady,
    CHATGPT: chatgptReady,
    META_AI: metaReady,
  };
}

export function buildReadinessFromDb(db: DatabaseManager): ProviderReadinessInput {
  const readyProviderIds = new Set<string>();
  for (const row of db.aiProviders.listEnabledOrdered()) {
    if (row.status === 'READY') readyProviderIds.add(row.id);
  }
  return {
    readyProviderIds,
    groupAccountReady: buildGroupAccountReadinessFromDb(db),
  };
}

export function buildProviderReadinessInput(
  _db: DatabaseManager,
  listProviders: () => { providers: { id: string; status: string; enabled: boolean }[] },
  groupAccountReady: Record<AiProviderPreference, boolean>,
): ProviderReadinessInput {
  const readyProviderIds = new Set<string>();
  for (const p of listProviders().providers) {
    if (p.enabled && p.status === 'READY') {
      readyProviderIds.add(p.id);
    }
  }
  return { readyProviderIds, groupAccountReady };
}

export function resolveEffectivePrimaryProviderId(
  db: DatabaseManager,
  readiness: ProviderReadinessInput,
  projectId?: string | null,
): string | null {
  let preference = readAiPreference(db);

  if (projectId) {
    const style = db.projects.getStyleConfig(projectId);
    if (!projectUsesGlobalPrimary(style)) {
      const projectPref = readProjectAiPreferenceOverride(style);
      if (projectPref) {
        preference = projectPref;
      }
    }
  }

  if (preference === 'AUTO') {
    return resolveAutoPrimaryProviderId(readiness);
  }

  return resolvePrimaryForPreference(preference, readiness);
}

export function applyAiPreference(
  db: DatabaseManager,
  service: AiProviderService,
  preference: AiPreference,
  readiness: ProviderReadinessInput,
): string | null {
  writeAiPreference(db, preference);
  service.manager.setRoutingMode('AUTO');

  if (preference === 'AUTO') {
    applyRecommendedProviderOrder(service);
    service.setFallback(true);
    service.manager.setPrimaryProviderId(null);
    const autoPrimary = resolveAutoPrimaryProviderId(readiness);
    if (autoPrimary) {
      service.manager.setPrimaryProviderId(autoPrimary);
    }
    return autoPrimary;
  }

  const providerId = resolvePrimaryForPreference(preference, readiness);
  if (!providerId) {
    throw new Error('Không tìm thấy nhà cung cấp cho lựa chọn AI');
  }
  service.setPrimaryProvider(providerId);
  return providerId;
}
