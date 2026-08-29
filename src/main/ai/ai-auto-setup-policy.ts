import {
  AI_PROVIDER_IDS,
  DEFAULT_FALLBACK_STATUSES,
} from '@shared/constants/ai-provider';
import type { AiAutoSetupResult, AiAutoSetupStep } from '@shared/schemas/ai-auto-setup';
import type { AiProviderService } from './ai-provider-service';

/** Safe default provider order — Web API first, Browser fallback. */
export function applyRecommendedProviderOrder(ai: AiProviderService): void {
  ai.setEnabled(AI_PROVIDER_IDS.GEMINI_OFFICIAL, false);
  ai.setEnabled(AI_PROVIDER_IDS.GEMINI_WEB_API, true);
  ai.setEnabled(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, true);
  ai.setPriority(AI_PROVIDER_IDS.GEMINI_WEB_API, 1);
  ai.setPriority(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, 2);
  ai.setPriority(AI_PROVIDER_IDS.GEMINI_OFFICIAL, 3);
  ai.setFallback(true, [...DEFAULT_FALLBACK_STATUSES]);
}

export function evaluateAutoSetupOutcome(input: {
  usableAccountCount: number;
  needsLogin: boolean;
  hasAnyAccount: boolean;
  geminiOk: boolean;
  workerOk: boolean;
}): Pick<AiAutoSetupResult, 'outcome' | 'title' | 'message' | 'action'> {
  if (!input.hasAnyAccount) {
    return {
      outcome: 'action_required',
      title: 'Cần tài khoản Google',
      message: 'Thêm tài khoản Google để dịch với Gemini.',
      action: 'add_account',
    };
  }
  if (input.usableAccountCount === 0 && input.needsLogin) {
    return {
      outcome: 'action_required',
      title: 'Cần đăng nhập Google',
      message: 'Còn 1 bước cần bạn thực hiện: Đăng nhập tài khoản Google.',
      action: 'login',
    };
  }
  if (input.geminiOk) {
    return {
      outcome: 'ready',
      title: '✓ AI sẵn sàng',
      message: 'Gemini hoạt động bình thường.',
      action: null,
    };
  }
  if (input.usableAccountCount === 0) {
    return {
      outcome: 'action_required',
      title: 'Cần tài khoản Google',
      message: 'Chưa có tài khoản Google sẵn sàng cho dịch.',
      action: 'add_account',
    };
  }
  if (!input.workerOk && !input.geminiOk) {
    return {
      outcome: 'failed',
      title: 'Không thể khởi động Gemini',
      message: 'Không thể khởi động Gemini. Thử sửa lại hoặc xem chi tiết.',
      action: null,
    };
  }
  return {
    outcome: 'failed',
    title: 'Không thể khởi động Gemini',
    message: 'Gemini chưa phản hồi sẵn sàng. Thử sửa lại hoặc xem chi tiết.',
    action: null,
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
