import { useCallback, useEffect, useState } from 'react';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import type { GoogleAccountDto } from '@shared/schemas/account';
import type { AiAccountDto } from '@shared/schemas/ai-provider';
import {
  aiAccountToViewModel,
  googleAccountToViewModel,
  sortAccountViewModels,
  type AiAccountViewModel,
} from './ai-account-view-model';

export interface UseAiAccountsResult {
  accounts: AiAccountViewModel[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAiAccounts(fallbackGoogleTitle: string): UseAiAccountsResult {
  const [accounts, setAccounts] = useState<AiAccountViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [googleRes, chatgptRes, metaRes] = await Promise.all([
      window.khepreeNovelAI.accounts.list(),
      window.khepreeNovelAI.aiAccounts.list({ providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT }),
      window.khepreeNovelAI.aiAccounts.list({ providerId: AI_PROVIDER_IDS.PLAYWRIGHT_META_AI }),
    ]);

    const google = googleRes.accounts.map((a: GoogleAccountDto) =>
      googleAccountToViewModel(a, fallbackGoogleTitle),
    );
    const chatgpt = chatgptRes.accounts.map((a: AiAccountDto) => aiAccountToViewModel(a));
    const meta = metaRes.accounts.map((a: AiAccountDto) => aiAccountToViewModel(a));

    setAccounts(sortAccountViewModels([...google, ...chatgpt, ...meta]));
  }, [fallbackGoogleTitle]);

  useEffect(() => {
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refresh]);

  return { accounts, loading, error, refresh };
}
