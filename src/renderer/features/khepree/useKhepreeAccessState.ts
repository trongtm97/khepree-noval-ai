import { useEffect, useState } from 'react';
import type { KhepreeAccessState } from '@shared/schemas/khepree';

export function useKhepreeAccessState(): {
  state: KhepreeAccessState | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<KhepreeAccessState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const next = await window.khepreeNovelAI.khepree.getAccessState();
    setState(next);
  };

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const initial = await window.khepreeNovelAI.khepree.getAccessState();
        if (ac.signal.aborted) return;
        setState(initial);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    const unsubscribe = window.khepreeNovelAI.khepree.onAccessState((next) => {
      setState(next);
      setLoading(false);
    });
    return () => {
      ac.abort();
      unsubscribe();
    };
  }, []);

  return { state, loading, refresh };
}
