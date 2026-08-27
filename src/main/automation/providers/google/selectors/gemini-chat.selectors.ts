import type { ChatSelectorCatalog } from './chat-selector-keys';
import { SHARED_CHAT_GATES } from './chat-selector-keys';

/**
 * gemini.google.com chat surface.
 * Prefer role / label / placeholder / accessible name; CSS last.
 * No bare h1 / button / [contenteditable=true] as sole evidence.
 */
export const GEMINI_CHAT_SELECTORS = {
  appShell: {
    key: 'appShell',
    description: 'Gemini chat app shell',
    strategies: [
      { kind: 'testId', testId: 'gemini-app' },
      { kind: 'css', css: '[data-gemini-app]' },
      { kind: 'css', css: '[data-surface="gemini-chat"]' },
      { kind: 'css', css: 'chat-app' },
      { kind: 'css', css: 'bard-sidenav-container' },
      {
        kind: 'role',
        role: 'textbox',
        name: /ask|prompt|message|enter a prompt/i,
      },
      { kind: 'css', css: 'rich-textarea' },
      { kind: 'css', css: 'main[data-test-id]' },
    ],
  },
  notebookContext: {
    key: 'notebookContext',
    description: 'Optional context banner (usually absent on plain Gemini chat)',
    strategies: [
      { kind: 'testId', testId: 'notebook-context' },
      { kind: 'css', css: '[data-notebook-context]' },
    ],
  },
  newChatButton: {
    key: 'newChatButton',
    description: 'Start new Gemini chat',
    strategies: [
      { kind: 'testId', testId: 'new-chat' },
      {
        kind: 'role',
        role: 'button',
        name: /new chat|new conversation|cuộc trò chuyện mới|chat mới/i,
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
    description: 'Active Gemini chat panel',
    strategies: [
      { kind: 'testId', testId: 'active-thread' },
      { kind: 'css', css: '[data-active-thread]' },
      { kind: 'css', css: 'chat-window' },
      { kind: 'css', css: 'rich-textarea' },
    ],
  },
  promptInput: {
    key: 'promptInput',
    description: 'Gemini chat composer (inside chat panel)',
    strategies: [
      { kind: 'testId', testId: 'prompt-input' },
      { kind: 'label', label: /^prompt$|^message$|enter a prompt|ask gemini/i },
      { kind: 'placeholder', placeholder: /enter a prompt|ask|message/i },
      {
        kind: 'role',
        role: 'textbox',
        name: /^ask\b|prompt|message|enter a prompt/i,
      },
      { kind: 'css', css: 'textarea[data-prompt-input]' },
      { kind: 'css', css: 'rich-textarea [contenteditable="true"]' },
      { kind: 'css', css: 'div.ql-editor[contenteditable="true"]' },
      { kind: 'css', css: '[contenteditable="true"][aria-label*="Ask" i]' },
      { kind: 'css', css: '[contenteditable="true"][aria-label*="prompt" i]' },
    ],
  },
  sendButton: {
    key: 'sendButton',
    description: 'Submit Gemini prompt',
    strategies: [
      { kind: 'testId', testId: 'send-prompt' },
      { kind: 'role', role: 'button', name: /^send$|submit|gửi/i },
      { kind: 'css', css: '[data-action="send-prompt"]' },
      { kind: 'css', css: "button[aria-label*='Send' i]:not([disabled])" },
      { kind: 'css', css: "button[aria-label*='Gửi' i]:not([disabled])" },
      { kind: 'css', css: '[data-test-id="send-button"]:not([disabled])' },
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
      { kind: 'css', css: '[aria-busy="true"]' },
    ],
  },
  responseList: {
    key: 'responseList',
    description: 'Assistant responses container',
    strategies: [
      { kind: 'testId', testId: 'response-list' },
      { kind: 'css', css: '[data-response-list]' },
      { kind: 'css', css: '[data-message-list]' },
      { kind: 'css', css: '[data-testid="message-list"]' },
    ],
  },
  assistantResponse: {
    key: 'assistantResponse',
    description: 'Logical Gemini model message container (deduped)',
    strategies: [
      // One strategy chain — do not OR nested text nodes with parents.
      { kind: 'testId', testId: 'assistant-response' },
      { kind: 'css', css: '[data-assistant-response]' },
      { kind: 'css', css: '[data-message-author-role="model"]' },
      { kind: 'css', css: 'message-content.model-response-text' },
      { kind: 'css', css: '.model-response-text' },
    ],
  },
  ...SHARED_CHAT_GATES,
} as const satisfies ChatSelectorCatalog;
