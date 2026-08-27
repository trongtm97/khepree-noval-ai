import type { ChatSelectorCatalog } from './chat-selector-keys';
import { SHARED_CHAT_GATES } from './chat-selector-keys';

/**
 * NotebookLM chat surface (notebooklm.google.com / notebook.google.com).
 * Composer strategies scoped to chat panel — not Discover Sources.
 */
export const NOTEBOOKLM_SELECTORS = {
  appShell: {
    key: 'appShell',
    description: 'NotebookLM app shell',
    strategies: [
      { kind: 'testId', testId: 'notebooklm-app' },
      { kind: 'css', css: '[data-notebooklm-app]' },
      { kind: 'css', css: '[data-surface="notebooklm"]' },
      // Legacy fixture marker reused by older chat fixtures
      { kind: 'testId', testId: 'gemini-app' },
      { kind: 'css', css: '[data-gemini-app]' },
      { kind: 'css', css: 'labs-tailwind-root' },
      { kind: 'css', css: 'welcome-page' },
      { kind: 'css', css: 'chat-panel' },
      { kind: 'css', css: 'query-box' },
      {
        kind: 'role',
        role: 'textbox',
        name: /hộp truy vấn|query box/i,
      },
      { kind: 'css', css: "button[aria-label='Settings']" },
      { kind: 'css', css: "button[aria-label='Cài đặt']" },
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
    description: 'Start new NotebookLM chat',
    strategies: [
      { kind: 'testId', testId: 'new-chat' },
      {
        kind: 'role',
        role: 'button',
        name: /new chat|new conversation|cuộc trò chuyện mới|chat mới|đoạn chat mới/i,
      },
      { kind: 'css', css: '[data-action="new-chat"]' },
      { kind: 'css', css: "button[aria-label*='New chat' i]" },
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
    description: 'Active NotebookLM chat panel',
    strategies: [
      { kind: 'testId', testId: 'active-thread' },
      { kind: 'css', css: '[data-active-thread]' },
      { kind: 'css', css: 'chat-panel' },
      { kind: 'css', css: '.chat-input' },
      { kind: 'css', css: 'query-box' },
    ],
  },
  promptInput: {
    key: 'promptInput',
    description: 'NotebookLM composer inside chat panel (not Discover Sources)',
    strategies: [
      { kind: 'testId', testId: 'prompt-input' },
      { kind: 'label', label: /^prompt$|^message$|hộp truy vấn|query box|enter a prompt/i },
      { kind: 'placeholder', placeholder: /đặt câu hỏi|ask a question|ask about/i },
      {
        kind: 'role',
        role: 'textbox',
        name: /hộp truy vấn|query box|ask a question/i,
      },
      { kind: 'css', css: 'textarea[data-prompt-input]' },
      { kind: 'css', css: 'textarea[aria-label="Hộp truy vấn"]' },
      { kind: 'css', css: 'textarea[aria-label="Query box"]' },
      { kind: 'css', css: 'textarea.query-box-input' },
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
    ],
  },
  sendButton: {
    key: 'sendButton',
    description: 'Submit NotebookLM prompt',
    strategies: [
      { kind: 'testId', testId: 'send-prompt' },
      { kind: 'role', role: 'button', name: /^send$|submit|gửi|gởi/i },
      { kind: 'css', css: '[data-action="send-prompt"]' },
      { kind: 'css', css: 'button.actions-enter-button:not([disabled])' },
      { kind: 'css', css: 'button.actions-enter-button:not(.mat-mdc-button-disabled)' },
      { kind: 'css', css: "button[aria-label*='Gửi' i]:not([disabled])" },
      { kind: 'css', css: "button[aria-label*='Send' i]:not([disabled])" },
      { kind: 'css', css: "button[aria-label*='Submit' i]:not([disabled])" },
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
      { kind: 'css', css: '[aria-busy="true"]' },
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
    description: 'Logical NotebookLM assistant container (deduped)',
    strategies: [
      { kind: 'testId', testId: 'assistant-response' },
      { kind: 'css', css: '[data-assistant-response]' },
      // Outer bubble only — avoid counting .message-text-content as a 2nd message.
      { kind: 'css', css: '.chat-message-pair .to-user-container' },
      { kind: 'css', css: '.to-user-container' },
    ],
  },
  ...SHARED_CHAT_GATES,
} as const satisfies ChatSelectorCatalog;
