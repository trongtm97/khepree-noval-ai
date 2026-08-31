import type { DatabaseManager } from '../db/database-manager';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';
import {
  isTranslationAiProviderId,
  TRANSLATION_AI_PROVIDER_IDS,
} from '@shared/constants/translation-ai-providers';
import {
  buildReadinessFromDb,
  resolveEffectivePrimaryProviderId,
  writeAiPreference,
} from './ai-preference-policy';
import { preferenceFromProviderId } from '@shared/constants/ai-preference';
import type { AiProviderService } from './ai-provider-service';

export function resolvePrimaryProviderId(
  db: DatabaseManager,
  projectId?: string | null,
): string | null {
  const readiness = buildReadinessFromDb(db);
  const resolved = resolveEffectivePrimaryProviderId(db, readiness, projectId);
  if (resolved) return resolved;

  const global = db.appMeta.get(AI_ROUTING_META_KEYS.primaryProviderId);
  if (global && global.length > 0 && isTranslationAiProviderId(global)) {
    return global;
  }

  const first = db.aiProviders
    .listEnabledOrdered()
    .find((row) => isTranslationAiProviderId(row.id));
  return first?.id ?? null;
}

export function applyPrimaryProvider(
  db: DatabaseManager,
  service: AiProviderService,
  providerId: string,
): void {
  if (!isTranslationAiProviderId(providerId)) {
    throw new Error('Provider không hỗ trợ làm nền tảng dịch chính');
  }

  const row = db.aiProviders.getById(providerId);
  if (!row) throw new Error('Provider not found');

  const mapped = preferenceFromProviderId(providerId);
  if (mapped) {
    writeAiPreference(db, mapped);
  }

  service.setEnabled(providerId, true);
  service.manager.setRoutingMode('AUTO');
  service.manager.setPrimaryProviderId(providerId);
  service.setFallback(true);

  const translationRows = TRANSLATION_AI_PROVIDER_IDS.map((id) =>
    db.aiProviders.getById(id),
  ).filter((r): r is NonNullable<typeof r> => r != null);

  const others = translationRows
    .filter((r) => r.id !== providerId)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  let priority = 1;
  service.setPriority(providerId, priority++);
  for (const other of others) {
    service.setPriority(other.id, priority++);
  }
}
