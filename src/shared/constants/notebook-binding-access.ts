/**
 * HARD REQUIREMENT 13 — bound NotebookLM inaccessible ≠ create another.
 * User-facing copy + action ids. Technical detail stays separate.
 */

export const NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI =
  'Không thể truy cập Notebook đã liên kết với truyện này.';

export const NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_EN =
  'Cannot access the Notebook linked to this story.';

export const NOTEBOOK_BINDING_ACCESS_ACTIONS = [
  'retry_connect',
  'open_notebook',
  'relink_notebook',
] as const;

export type NotebookBindingAccessAction =
  (typeof NOTEBOOK_BINDING_ACCESS_ACTIONS)[number];

export const NOTEBOOK_BINDING_ACCESS_ACTION_LABELS_VI: Record<
  NotebookBindingAccessAction,
  string
> = {
  retry_connect: 'Thử kết nối lại',
  open_notebook: 'Mở Notebook',
  relink_notebook: 'Liên kết lại',
};

export function isNotebookBindingInaccessibleStatus(status: string | null | undefined): boolean {
  return status === 'unavailable' || status === 'assisted_setup';
}

export function notebookBindingInaccessiblePayload(technicalDetail: string): {
  userMessage: string;
  technicalDetail: string;
  actions: NotebookBindingAccessAction[];
} {
  return {
    userMessage: NOTEBOOK_BINDING_INACCESSIBLE_USER_MESSAGE_VI,
    technicalDetail,
    actions: [...NOTEBOOK_BINDING_ACCESS_ACTIONS],
  };
}
