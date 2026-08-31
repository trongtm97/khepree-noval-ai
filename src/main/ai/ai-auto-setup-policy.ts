import {
  AI_PROVIDER_IDS,
  DEFAULT_FALLBACK_STATUSES,
} from '@shared/constants/ai-provider';
import type {
  AiPreference,
  AiProviderPreference,
} from '@shared/constants/ai-preference';
import { AI_PROVIDER_PREFERENCES } from '@shared/constants/ai-preference';
import type { AiAutoSetupResult, AiAutoSetupStep } from '@shared/schemas/ai-auto-setup';
import type { AiProviderService } from './ai-provider-service';

/** Safe default provider order — Web API first, Browser fallback. */
export function applyRecommendedProviderOrder(ai: AiProviderService): void {
  ai.setEnabled(AI_PROVIDER_IDS.GEMINI_OFFICIAL, false);
  ai.setEnabled(AI_PROVIDER_IDS.GEMINI_WEB_API, true);
  ai.setEnabled(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, true);
  ai.setPriority(AI_PROVIDER_IDS.GEMINI_WEB_API, 1);
  ai.setPriority(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, 2);
  ai.setPriority(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 3);
  ai.setPriority(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 4);
  ai.setPriority(AI_PROVIDER_IDS.GEMINI_OFFICIAL, 5);
  ai.setFallback(true, [...DEFAULT_FALLBACK_STATUSES]);
}

export function evaluateAutoSetupOutcome(input: {
  preference: AiPreference;
  providerReady: Record<AiProviderPreference, boolean>;
  anyAccount: boolean;
  usableAccountCount: number;
  needsLogin: AiProviderPreference | null;
  workerOk: boolean;
  anyProviderOk: boolean;
}): Pick<AiAutoSetupResult, 'outcome' | 'title' | 'message' | 'action' | 'loginTarget'> {
  const readyCount = AI_PROVIDER_PREFERENCES.filter((p) => input.providerReady[p]).length;

  if (!input.anyAccount && readyCount === 0) {
    return {
      outcome: 'action_required',
      title: 'Cần tài khoản AI',
      message: 'Thêm tài khoản AI để Khepree Novel AI có thể dịch truyện.',
      action: 'add_account',
      loginTarget: null,
    };
  }

  if (input.needsLogin) {
    return {
      outcome: 'action_required',
      title: 'Cần đăng nhập tài khoản AI',
      message: 'Còn 1 bước cần bạn thực hiện: đăng nhập tài khoản AI.',
      action: 'login',
      loginTarget: input.needsLogin,
    };
  }

  if (input.anyProviderOk || readyCount > 0) {
    return {
      outcome: 'ready',
      title: '✓ AI sẵn sàng',
      message: 'Các nhà cung cấp AI đã sẵn sàng cho dịch.',
      action: null,
      loginTarget: null,
    };
  }

  if (!input.workerOk) {
    return {
      outcome: 'failed',
      title: 'Không thể khởi động AI',
      message: 'Không thể khởi động hệ thống AI. Thử sửa lại hoặc xem chi tiết.',
      action: null,
      loginTarget: null,
    };
  }

  return {
    outcome: 'failed',
    title: 'AI chưa sẵn sàng',
    message: 'Chưa có nhà cung cấp AI phản hồi sẵn sàng. Thử sửa lại hoặc xem chi tiết.',
    action: null,
    loginTarget: null,
  };
}

export function mergeAutoSetupResult(
  steps: AiAutoSetupStep[],
  technical: Record<string, string | boolean | number | null>,
  evalInput: Parameters<typeof evaluateAutoSetupOutcome>[0],
): AiAutoSetupResult {
  const verdict = evaluateAutoSetupOutcome(evalInput);
  return {
    ...verdict,
    usableAccountCount: evalInput.usableAccountCount,
    steps,
    technical,
  };
}
