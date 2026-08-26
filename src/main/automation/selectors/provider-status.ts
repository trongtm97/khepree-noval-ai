import type { AutomationProviderId } from '@shared/constants/diagnostics';
import {
  PROVIDER_DIAGNOSTICS_META,
  providerLastSuccessMetaKey,
} from '@shared/constants/diagnostics';
import type { ProviderStatus } from '@shared/schemas/diagnostics';
import type { DatabaseManager } from '../../db/database-manager';
import { countOverridesForProvider } from './selector-override-loader';

export function recordProviderSuccess(
  db: DatabaseManager,
  providerId: AutomationProviderId,
  at = new Date().toISOString(),
): void {
  db.appMeta.set(providerLastSuccessMetaKey(providerId), at);
}

export function getProviderLastSuccess(
  db: DatabaseManager,
  providerId: AutomationProviderId,
): string | null {
  return db.appMeta.get(providerLastSuccessMetaKey(providerId));
}

export function listProviderStatuses(db: DatabaseManager): ProviderStatus[] {
  return (Object.keys(PROVIDER_DIAGNOSTICS_META) as AutomationProviderId[]).map(
    (providerId) => {
      const meta = PROVIDER_DIAGNOSTICS_META[providerId];
      return {
        providerId,
        label: meta.label,
        providerVersion: meta.providerVersion,
        selectorRegistryVersion: meta.selectorRegistryVersion,
        lastSuccessfulRun: getProviderLastSuccess(db, providerId),
        overrideCount: countOverridesForProvider(providerId),
      };
    },
  );
}
