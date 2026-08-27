import type { SelectorStrategy } from '../../../selectors/selector-strategy';

export interface SelectorEntry {
  key: string;
  strategies: SelectorStrategy[];
  description: string;
}

/** Shared chat selector keys across GEMINI_CHAT / GEMINI_NOTEBOOK / NOTEBOOKLM. */
export const CHAT_SELECTOR_KEYS = [
  'appShell',
  'notebookContext',
  'newChatButton',
  'threadList',
  'activeThread',
  'promptInput',
  'sendButton',
  'stopButton',
  'loadingIndicator',
  'responseList',
  'assistantResponse',
  'loginRequired',
  'captchaGate',
  'quotaLimit',
] as const;

export type ChatSelectorKey = (typeof CHAT_SELECTOR_KEYS)[number];

export type ChatSelectorCatalog = Record<ChatSelectorKey, SelectorEntry>;

/** Shared gate / fixture-friendly markers used by all chat catalogs. */
export const SHARED_CHAT_GATES = {
  loginRequired: {
    key: 'loginRequired',
    description: 'Login gate marker',
    strategies: [
      { kind: 'testId', testId: 'login-required' },
      { kind: 'text', text: /sign in|login required|đăng nhập/i },
    ],
  },
  captchaGate: {
    key: 'captchaGate',
    description: 'CAPTCHA / challenge gate',
    strategies: [
      { kind: 'testId', testId: 'captcha' },
      { kind: 'text', text: /captcha|unusual traffic|verify/i },
    ],
  },
  quotaLimit: {
    key: 'quotaLimit',
    description: 'Quota / rate limit banner',
    strategies: [
      { kind: 'testId', testId: 'quota-limit' },
      { kind: 'text', text: /quota|rate limit|limit reached|đã hết hạn mức/i },
    ],
  },
} as const satisfies Record<string, SelectorEntry>;
