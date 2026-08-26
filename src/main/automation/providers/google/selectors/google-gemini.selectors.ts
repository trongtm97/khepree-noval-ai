import type { Locator, Page } from 'playwright';
import { AutomationError } from '../../../errors/automation-errors';
import { captureFailureDiagnostics } from '../../../diagnostics';
import {
  describeStrategy,
  locatorFromStrategy,
  mergeStrategies,
  type SelectorStrategy,
} from '../../../selectors/selector-strategy';
import { getOverrideForSelector } from '../../../selectors/selector-override-loader';

export type { SelectorStrategy };

export interface SelectorEntry {
  key: string;
  strategies: SelectorStrategy[];
  description: string;
}

/** All Gemini / NotebookLM chat locators live here only. */
export const GOOGLE_GEMINI_SELECTORS = {
  appShell: {
    key: 'appShell',
    description: 'Gemini / NotebookLM chat shell',
    strategies: [
      // Fixtures / overrides
      { kind: 'testId', testId: 'gemini-app' },
      { kind: 'css', css: '[data-gemini-app]' },
      // Live NotebookLM (notebook.google.com) — reuse probe from notebook selectors
      { kind: 'css', css: 'welcome-page' },
      { kind: 'css', css: 'labs-tailwind-root' },
      { kind: 'css', css: 'chat-panel' },
      { kind: 'css', css: 'query-box' },
      { kind: 'css', css: '.chat-input' },
      { kind: 'css', css: "a[aria-label*='Gemini Notebook']" },
      { kind: 'css', css: "button[aria-label='Settings']" },
      { kind: 'css', css: "button[aria-label='Cài đặt']" },
      { kind: 'css', css: "button[aria-label*='Configure chat']" },
      { kind: 'css', css: "button[aria-label*='Configure notebook']" },
      // Live gemini.google.com
      { kind: 'css', css: 'chat-app' },
      { kind: 'css', css: 'bard-sidenav-container' },
      { kind: 'css', css: 'main[data-test-id]' },
      { kind: 'css', css: 'rich-textarea' },
      { kind: 'css', css: 'div.ql-editor[contenteditable="true"]' },
      {
        kind: 'role',
        role: 'textbox',
        name: /ask|prompt|message|hộp truy vấn|query box|nhắn/i,
      },
      { kind: 'css', css: 'textarea.query-box-input' },
      { kind: 'css', css: 'rich-textarea' },
    ],
  },
  notebookContext: {
    key: 'notebookContext',
    description: 'Open notebook context banner',
    strategies: [
      { kind: 'testId', testId: 'notebook-context' },
      { kind: 'css', css: '[data-notebook-context]' },
      { kind: 'css', css: '[data-test-id="notebook-title"]' },
      { kind: 'css', css: 'notebook-title' },
      { kind: 'css', css: 'h1' },
    ],
  },
  newChatButton: {
    key: 'newChatButton',
    description: 'Start new translation thread',
    strategies: [
      { kind: 'testId', testId: 'new-chat' },
      { kind: 'role', role: 'button', name: /new chat|new conversation|cuộc trò chuyện mới|chat mới|đoạn chat mới/i },
      { kind: 'css', css: '[data-action="new-chat"]' },
      { kind: 'css', css: "button[aria-label*='New chat' i]" },
      { kind: 'css', css: "button[aria-label*='New conversation' i]" },
      { kind: 'css', css: "button[aria-label*='Cuộc trò chuyện mới' i]" },
      { kind: 'css', css: "button[aria-label*='Chat mới' i]" },
      { kind: 'text', text: /new chat|new conversation|cuộc trò chuyện mới/i },
    ],
  },
  threadList: {
    key: 'threadList',
    description: 'Conversation thread list',
    strategies: [
      { kind: 'testId', testId: 'thread-list' },
      { kind: 'css', css: '[data-thread-list]' },
      { kind: 'css', css: '[data-test-id="conversation-list"]' },
      { kind: 'css', css: 'conversation-list' },
    ],
  },
  activeThread: {
    key: 'activeThread',
    description: 'Currently open thread panel',
    strategies: [
      { kind: 'testId', testId: 'active-thread' },
      { kind: 'css', css: '[data-active-thread]' },
      // Live: chat surface with a visible composer counts as active thread
      { kind: 'css', css: 'chat-panel' },
      { kind: 'css', css: '.chat-input' },
      { kind: 'css', css: 'query-box' },
      { kind: 'css', css: 'rich-textarea' },
      { kind: 'css', css: 'form:has(textarea)' },
      { kind: 'css', css: 'div.ql-editor[contenteditable="true"]' },
    ],
  },
  promptInput: {
    key: 'promptInput',
    description: 'Chat prompt composer',
    strategies: [
      { kind: 'testId', testId: 'prompt-input' },
      { kind: 'css', css: 'textarea[data-prompt-input]' },
      // AI CHAT BATCH NotebookLM winners — avoid Discover Sources (đã nhập / discoverSourcesQuery)
      { kind: 'css', css: 'textarea[aria-label="Hộp truy vấn"]' },
      { kind: 'css', css: 'textarea[aria-label="Query box"]' },
      { kind: 'css', css: 'textarea[aria-label*="Query box" i]' },
      { kind: 'css', css: 'textarea.query-box-input' },
      { kind: 'css', css: 'textarea[placeholder="Đặt câu hỏi hoặc tạo nội dung"]' },
      { kind: 'css', css: 'textarea[placeholder*="Đặt câu hỏi" i]' },
      { kind: 'css', css: 'textarea[placeholder*="Ask a question" i]' },
      { kind: 'css', css: 'textarea[placeholder*="Ask about" i]' },
      { kind: 'label', label: /^prompt$|^message$|hộp truy vấn|query box|enter a prompt/i },
      // Scoped chat surface (exclude Discover Sources + disabled)
      {
        kind: 'css',
        css: 'chat-panel textarea:not([disabled]):not([readonly]):not([formcontrolname="discoverSourcesQuery"])',
      },
      {
        kind: 'css',
        css: '.chat-input textarea:not([disabled]):not([readonly]):not([formcontrolname="discoverSourcesQuery"])',
      },
      {
        kind: 'css',
        css: 'query-box textarea.query-box-input:not([disabled]):not([readonly])',
      },
      {
        kind: 'css',
        css: 'query-box textarea:not([disabled]):not([readonly]):not([formcontrolname="discoverSourcesQuery"])',
      },
      { kind: 'css', css: 'textarea[placeholder*="Ask" i]:not([disabled]):not([readonly])' },
      { kind: 'css', css: 'textarea[placeholder*="Hỏi" i]:not([disabled]):not([readonly])' },
      { kind: 'css', css: 'textarea[aria-label*="Ask" i]:not([disabled]):not([readonly])' },
      { kind: 'css', css: '[data-test-id="chat-input"]' },
      // Live Gemini composer
      { kind: 'css', css: 'rich-textarea [contenteditable="true"]' },
      { kind: 'css', css: 'div.ql-editor[contenteditable="true"]' },
      { kind: 'css', css: '[contenteditable="true"][aria-label*="Ask" i]' },
      { kind: 'css', css: '[contenteditable="true"][aria-label*="prompt" i]' },
      { kind: 'css', css: '[contenteditable="true"][aria-label*="Enter" i]' },
      {
        kind: 'role',
        role: 'textbox',
        name: /^ask\b|prompt|message|hộp truy vấn|query box|enter a prompt/i,
      },
    ],
  },
  sendButton: {
    key: 'sendButton',
    description: 'Submit prompt',
    strategies: [
      { kind: 'testId', testId: 'send-prompt' },
      { kind: 'css', css: '[data-action="send-prompt"]' },
      // Prefer enabled NotebookLM / Gemini send (disabled Gửi matches role too early)
      { kind: 'css', css: 'button.actions-enter-button:not([disabled])' },
      { kind: 'css', css: 'button.actions-enter-button:not(.mat-mdc-button-disabled)' },
      { kind: 'css', css: "button[aria-label*='Gửi' i]:not([disabled])" },
      { kind: 'css', css: "button[aria-label*='Send' i]:not([disabled])" },
      { kind: 'css', css: "button[aria-label*='Submit' i]:not([disabled])" },
      { kind: 'css', css: "button[type='submit']:not([disabled])" },
      { kind: 'css', css: '[data-test-id="send-button"]:not([disabled])' },
      { kind: 'role', role: 'button', name: /^send$|submit|gửi|gởi/i },
      { kind: 'css', css: "button[aria-label*='Gửi' i]" },
      { kind: 'css', css: "button[aria-label*='Send' i]" },
      { kind: 'css', css: 'button:has(mat-icon:has-text("send"))' },
    ],
  },
  stopButton: {
    key: 'stopButton',
    description: 'Cancel in-flight generation',
    strategies: [
      { kind: 'testId', testId: 'stop-generation' },
      { kind: 'role', role: 'button', name: /stop|cancel generation|dừng|hủy/i },
      { kind: 'css', css: '[data-action="stop-generation"]' },
      { kind: 'css', css: "button[aria-label*='Stop' i]" },
    ],
  },
  loadingIndicator: {
    key: 'loadingIndicator',
    description: 'Generation in progress indicator',
    strategies: [
      { kind: 'testId', testId: 'loading-indicator' },
      { kind: 'css', css: '[data-generating="1"]' },
      { kind: 'text', text: /generating|thinking|đang tạo|đang suy nghĩ/i },
      { kind: 'css', css: '[class*="typing" i]' },
      { kind: 'css', css: '[class*="loading" i][aria-busy="true"]' },
      { kind: 'css', css: '[aria-label*="loading" i]' },
    ],
  },
  responseList: {
    key: 'responseList',
    description: 'Assistant responses container',
    strategies: [
      { kind: 'testId', testId: 'response-list' },
      { kind: 'css', css: '[data-response-list]' },
      { kind: 'css', css: 'chat-panel' },
      { kind: 'css', css: '[class*="response" i]' },
    ],
  },
  assistantResponse: {
    key: 'assistantResponse',
    description: 'Single assistant response bubble',
    strategies: [
      { kind: 'testId', testId: 'assistant-response' },
      { kind: 'css', css: '[data-assistant-response]' },
      // AI CHAT BATCH NotebookLM response bubbles
      { kind: 'css', css: '.chat-message-pair .to-user-container .message-text-content' },
      { kind: 'css', css: '.chat-message-pair .to-user-message-inner-content' },
      { kind: 'css', css: '.to-user-container .message-text-content' },
      { kind: 'css', css: '.to-user-message-inner-content.message-content' },
      { kind: 'css', css: '.to-user-container' },
      // Live Gemini / Notebook surfaces (best-effort)
      { kind: 'css', css: 'message-content.model-response-text' },
      { kind: 'css', css: '.model-response-text' },
      { kind: 'css', css: '[data-message-author-role="model"]' },
      { kind: 'css', css: 'div.response-container' },
      { kind: 'css', css: '[class*="to-user-message" i]' },
      { kind: 'css', css: '[class*="model-response" i]' },
      { kind: 'css', css: '[class*="assistant" i]' },
    ],
  },
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

export type GeminiSelectorKey = keyof typeof GOOGLE_GEMINI_SELECTORS;

export class GeminiSelectorRegistry {
  constructor(
    private readonly page: Page,
    private readonly diagnosticsDir: string,
  ) {}

  private strategiesFor(key: GeminiSelectorKey): SelectorStrategy[] {
    const entry = GOOGLE_GEMINI_SELECTORS[key];
    const override = getOverrideForSelector('google-gemini', key);
    return mergeStrategies(
      [...entry.strategies],
      override?.strategies,
      override?.mode ?? 'prepend',
    );
  }

  async resolve(
    key: GeminiSelectorKey,
    options?: { timeoutMs?: number; visible?: boolean; editable?: boolean },
  ): Promise<Locator> {
    const entry = GOOGLE_GEMINI_SELECTORS[key];
    const timeoutMs = options?.timeoutMs ?? 2_500;
    const errors: string[] = [];
    const strategies = this.strategiesFor(key);
    const candidates = strategies.map(describeStrategy);
    const requireEditable = options?.editable === true || key === 'promptInput';

    for (const strategy of strategies) {
      const locator = locatorFromStrategy(this.page, strategy);
      try {
        let count = await locator.count().catch(() => 0);
        if (count === 0) {
          // Wait for first match to appear, then re-count.
          const first = locator.first();
          await first.waitFor({
            state: options?.visible === false ? 'attached' : 'visible',
            timeout: timeoutMs,
          });
          count = Math.max(await locator.count().catch(() => 1), 1);
        }

        for (let i = 0; i < count; i++) {
          const target = locator.nth(i);
          try {
            await target.waitFor({
              state: options?.visible === false ? 'attached' : 'visible',
              timeout: i === 0 ? timeoutMs : Math.min(timeoutMs, 800),
            });
          } catch {
            continue;
          }
          if (requireEditable) {
            const editable = await isEditableComposerLocator(target);
            if (!editable) {
              errors.push(`${describeStrategy(strategy)}[#${i}]: visible but not editable`);
              continue;
            }
          }
          return target;
        }
      } catch (error) {
        errors.push(
          `${describeStrategy(strategy)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const diagnostics = await captureFailureDiagnostics({
      page: this.page,
      diagnosticsDir: this.diagnosticsDir,
      operationName: `selector:${entry.key}`,
      tag: entry.key,
      selectorKey: entry.key,
      selectorCandidates: candidates,
    });

    throw new AutomationError(
      'SELECTOR_NOT_FOUND',
      `Gemini selector not found: ${entry.key} (${entry.description}). Tried: ${errors.join(' | ')}`,
      diagnostics,
    );
  }

  async tryResolve(
    key: GeminiSelectorKey,
    options?: { timeoutMs?: number; visible?: boolean; editable?: boolean },
  ): Promise<Locator | null> {
    try {
      return await this.resolve(key, { ...options, timeoutMs: options?.timeoutMs ?? 800 });
    } catch (error: unknown) {
      if (error instanceof AutomationError && error.code === 'SELECTOR_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  assistantResponses(): Locator {
    return this.page
      .getByTestId('assistant-response')
      .or(this.page.locator('[data-assistant-response]'))
      .or(this.page.locator('.chat-message-pair .to-user-container .message-text-content'))
      .or(this.page.locator('.to-user-container .message-text-content'))
      .or(this.page.locator('.to-user-message-inner-content'))
      .or(this.page.locator('message-content.model-response-text'))
      .or(this.page.locator('.model-response-text'))
      .or(this.page.locator('[data-message-author-role="model"]'))
      .or(this.page.locator('div.response-container'))
      .or(this.page.locator('[class*="model-response" i]'))
      .or(this.page.locator('[class*="to-user-message" i]'));
  }

  responseForCorrelation(correlationId: string): Locator {
    const escaped = correlationId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return this.page
      .locator(`[data-correlation-id="${escaped}"]`)
      .and(this.assistantResponses());
  }

  async isStreamingVisible(): Promise<boolean> {
    const loading = await this.tryResolve('loadingIndicator', { timeoutMs: 300 });
    if (!loading) return false;
    return loading.isVisible().catch(() => false);
  }

  async isAnyResponseStreaming(): Promise<boolean> {
    const streaming = this.page.locator('[data-streaming="1"]');
    return (await streaming.count()) > 0;
  }
}

/** True when the node can accept typed/pasted chat input (not Discover Sources / disabled). */
async function isEditableComposerLocator(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((el) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        if (el.disabled || el.readOnly) return false;
        const name = (el.getAttribute('formcontrolname') || '').toLowerCase();
        if (name === 'discoversourcesquery') return false;
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('khám phá nguồn') || aria.includes('discover source')) return false;
        return true;
      }
      if (el instanceof HTMLElement && el.isContentEditable) return true;
      const role = el.getAttribute('role');
      return role === 'textbox' || role === 'searchbox';
    })
    .catch(() => false);
}
