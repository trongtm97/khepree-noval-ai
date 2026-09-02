import { useEffect, useState } from 'react';
import type { KhepreePlanCatalogItem } from '@shared/schemas/khepree-api';

export function useKhepreePlanCatalog(enabled: boolean): {
  plans: KhepreePlanCatalogItem[];
  currentPlanId: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [plans, setPlans] = useState<KhepreePlanCatalogItem[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.khepreeNovelAI.khepree.getPlanCatalog();
      if (result.ok) {
        setPlans(result.catalog.plans);
        setCurrentPlanId(result.catalog.currentPlanId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setPlans([]);
      setCurrentPlanId(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled]);

  return { plans, currentPlanId, loading, error, reload };
}
