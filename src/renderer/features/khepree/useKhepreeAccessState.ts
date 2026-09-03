import { useEffect, useState } from 'react';
import type { KhepreeAccessState } from '@shared/schemas/khepree';

export function useKhepreeAccessState(): {
  state: KhepreeAccessState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<KhepreeAccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const next = await window.khepreeNovelAI.khepree.getAccessState();
      setState(next);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Khepree access state');
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const initial = await window.khepreeNovelAI.khepree.getAccessState();
        if (ac.signal.aborted) return;
        setState(initial);
        setError(null);
      } catch (err: unknown) {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load Khepree access state');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    const unsubscribe = window.khepreeNovelAI.khepree.onAccessState((next) => {
      setState(next);
      setError(null);
      setLoading(false);
    });
    return () => {
      ac.abort();
      unsubscribe();
    };
  }, []);

  return { state, loading, error, refresh };
}
