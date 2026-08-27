import type { ChatSelectorCatalog } from './chat-selector-keys';
import { SHARED_CHAT_GATES } from './chat-selector-keys';

/**
 * Gemini Notebook chat surface (notebook.google.com + Gemini Notebook chrome).
 * Distinct from plain NotebookLM catalog.
 */
export const GEMINI_NOTEBOOK_SELECTORS = {
  appShell: {
    key: 'appShell',
    description: 'Gemini Notebook app shell',
    strategies: [
      { kind: 'testId', testId: 'gemini-notebook-app' },
      { kind: 'css', css: '[data-gemini-notebook-app]' },
      { kind: 'css', css: '[data-surface="gemini-notebook"]' },
      { kind: 'css', css: "a[aria-label*='Gemini Notebook' i]" },
      { kind: 'css', css: 'labs-tailwind-root' },
      { kind: 'css', css: 'chat-panel' },
      {
        kind: 'role',
        role: 'textbox',
        name: /query box|hộp truy vấn|ask/i,
      },
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
    ],
  },
  newChatButton: {
    key: 'newChatButton',
    description: 'Start new notebook chat',
    strategies: [
      { kind: 'testId', testId: 'new-chat' },
      {
        kind: 'role',
        role: 'button',
        name: /new chat|new conversation|cuộc trò chuyện mới|chat mới/i,
      },
      { kind: 'css', css: '[data-action="new-chat"]' },
    ],
  },
  threadList: {
    key: 'threadList',
    description: 'Conversation thread list',
    strategies: [
      { kind: 'testId', testId: 'thread-list' },
      { kind: 'css', css: '[data-thread-list]' },
    ],
  },
  activeThread: {
    key: 'activeThread',
    description: 'Active Gemini Notebook chat panel',
    strategies: [
      { kind: 'testId', testId: 'active-thread' },
      { kind: 'css', css: '[data-active-thread]' },
      { kind: 'css', css: 'chat-panel' },
      { kind: 'css', css: '.chat-input' },
    ],
  },
  promptInput: {
    key: 'promptInput',
    description: 'Composer inside Gemini Notebook chat panel',
    strategies: [
      { kind: 'testId', testId: 'prompt-input' },
      { kind: 'label', label: /hộp truy vấn|query box|ask/i },
      { kind: 'placeholder', placeholder: /đặt câu hỏi|ask a question|ask about/i },
      {
        kind: 'role',
        role: 'textbox',
        name: /hộp truy vấn|query box|ask/i,
      },
      { kind: 'css', css: 'chat-panel textarea:not([disabled]):not([readonly])' },
      { kind: 'css', css: 'query-box textarea.query-box-input:not([disabled])' },
      { kind: 'css', css: 'textarea[data-prompt-input]' },
    ],
  },
  sendButton: {
    key: 'sendButton',
    description: 'Submit notebook chat prompt',
    strategies: [
      { kind: 'testId', testId: 'send-prompt' },
      { kind: 'role', role: 'button', name: /^send$|gửi|gởi/i },
      { kind: 'css', css: '[data-action="send-prompt"]' },
      { kind: 'css', css: 'button.actions-enter-button:not([disabled])' },
      { kind: 'css', css: "button[aria-label*='Gửi' i]:not([disabled])" },
      { kind: 'css', css: "button[aria-label*='Send' i]:not([disabled])" },
    ],
  },
  stopButton: {
    key: 'stopButton',
    description: 'Cancel in-flight generation',
    strategies: [
      { kind: 'testId', testId: 'stop-generation' },
      { kind: 'role', role: 'button', name: /stop|dừng|hủy/i },
      { kind: 'css', css: '[data-action="stop-generation"]' },
    ],
  },
  loadingIndicator: {
    key: 'loadingIndicator',
    description: 'Generation in progress indicator',
    strategies: [
      { kind: 'testId', testId: 'loading-indicator' },
      { kind: 'css', css: '[data-generating="1"]' },
      { kind: 'text', text: /generating|thinking|đang tạo/i },
    ],
  },
  responseList: {
    key: 'responseList',
    description: 'Assistant responses container',
    strategies: [
      { kind: 'testId', testId: 'response-list' },
      { kind: 'css', css: '[data-response-list]' },
      { kind: 'css', css: 'chat-panel' },
    ],
  },
  assistantResponse: {
    key: 'assistantResponse',
    description: 'Logical assistant message container (one per bubble)',
    strategies: [
      { kind: 'testId', testId: 'assistant-response' },
      { kind: 'css', css: '[data-assistant-response]' },
      // Outer logical container only — not nested .message-text-content too.
      { kind: 'css', css: '.chat-message-pair .to-user-container' },
      { kind: 'css', css: '.to-user-container' },
    ],
  },
  ...SHARED_CHAT_GATES,
} as const satisfies ChatSelectorCatalog;
