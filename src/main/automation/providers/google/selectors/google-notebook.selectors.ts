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

/**
 * Selector strategies — tried in order.
 * Prefer role/label over brittle CSS. All NotebookLM locators live HERE only.
 */
export type { SelectorStrategy };

export interface SelectorEntry {
  key: string;
  strategies: SelectorStrategy[];
  description: string;
}

/**
 * Central registry — do not scatter locators in NotebookProvider.
 * Fixture strategies first (unit tests); live NotebookLM / Gemini Notebook next
 * (aria-label / mat-card from 2026-06 UI probe).
 */
export const GOOGLE_NOTEBOOK_SELECTORS = {
  appShell: {
    key: 'appShell',
    description: 'NotebookLM / Gemini Notebook app chrome',
    strategies: [
      { kind: 'testId', testId: 'notebook-app' },
      { kind: 'css', css: '[data-notebook-app]' },
      // Live Gemini Notebook 2026 (EN + VI) — host notebook.google.com
      { kind: 'css', css: 'welcome-page' },
      { kind: 'css', css: 'labs-tailwind-root' },
      { kind: 'css', css: "a[aria-label*='Gemini Notebook']" },
      { kind: 'css', css: "button[aria-label='Cài đặt']" },
      { kind: 'css', css: "button[aria-label='Settings']" },
      { kind: 'css', css: "button[aria-label='Create new notebook']" },
      {
        kind: 'role',
        role: 'button',
        name: /create new notebook|tạo sổ ghi chú mới|tạo sổ tay|tạo notebook|new notebook/i,
      },
      { kind: 'text', text: /tạo sổ ghi chú mới|create new notebook/i },
      { kind: 'css', css: "button[aria-label='Configure notebook']" },
      { kind: 'css', css: 'mat-card[role="button"]:has(h3)' },
      // Intentionally no bare role=main — too many unrelated pages match.
    ],
  },
  notebookList: {
    key: 'notebookList',
    description: 'List of notebooks',
    strategies: [
      { kind: 'testId', testId: 'notebook-list' },
      { kind: 'css', css: '[data-notebook-list]' },
      { kind: 'role', role: 'list', name: /notebook/i },
      // Live grid — any notebook card counts as list surface
      { kind: 'css', css: 'mat-card[role="button"]:has(h3)' },
      { kind: 'css', css: "a[href*='/notebook/']" },
    ],
  },
  notebookItem: {
    key: 'notebookItem',
    description: 'Single notebook row/card',
    strategies: [
      { kind: 'testId', testId: 'notebook-item' },
      { kind: 'css', css: '[data-notebook-item]' },
      { kind: 'css', css: 'mat-card[role="button"]:has(h3)' },
      { kind: 'css', css: "a[href*='/notebook/']" },
    ],
  },
  createNotebookButton: {
    key: 'createNotebookButton',
    description: 'Create new notebook',
    strategies: [
      { kind: 'testId', testId: 'create-notebook' },
      // Gemini Notebook 2026 VI header CTA
      { kind: 'role', role: 'button', name: /^\+?\s*tạo mới$/i },
      { kind: 'text', text: /^\+?\s*Tạo mới$/ },
      { kind: 'css', css: "button[aria-label='Create new notebook']" },
      { kind: 'css', css: "button[aria-label*='Create new notebook']" },
      { kind: 'css', css: "button[aria-label*='New notebook']" },
      { kind: 'css', css: "button[aria-label*='Tạo sổ ghi chú']" },
      { kind: 'css', css: "button[aria-label*='Tạo mới']" },
      {
        kind: 'role',
        role: 'button',
        name: /create new notebook|new notebook|create notebook|create new|tạo sổ ghi chú mới|tạo sổ tay|tạo notebook|tạo mới/i,
      },
      { kind: 'text', text: /tạo sổ ghi chú mới|create new notebook|create new/i },
      { kind: 'css', css: '[data-action="create-notebook"]' },
      { kind: 'css', css: "mat-card[role='button']:has-text('Create new notebook')" },
      { kind: 'css', css: "mat-card[role='button']:has-text('Create new')" },
      { kind: 'css', css: "mat-card[role='button']:has-text('Tạo sổ ghi chú mới')" },
      { kind: 'css', css: '.create-new-notebook, [class*="create-new"]' },
    ],
  },
  notebookTitleInput: {
    key: 'notebookTitleInput',
    description: 'Notebook rename / title field',
    strategies: [
      { kind: 'testId', testId: 'notebook-title-input' },
      { kind: 'css', css: 'input.title-input' },
      { kind: 'label', label: /notebook (name|title)|title|tên sổ|tiêu đề/i },
      { kind: 'placeholder', placeholder: /notebook name|title|tên|tiêu đề/i },
      { kind: 'css', css: 'input[data-notebook-title]' },
      { kind: 'css', css: 'mat-dialog-container input' },
      { kind: 'css', css: 'dialog input' },
    ],
  },
  dismissOverlayButton: {
    key: 'dismissOverlayButton',
    description: 'Close onboarding / add-source auto dialog',
    strategies: [
      { kind: 'css', css: "button[aria-label='Close']" },
      { kind: 'css', css: "button[aria-label='Đóng']" },
      { kind: 'role', role: 'button', name: /^close$|^đóng$/i },
      { kind: 'css', css: 'mat-dialog-container button[aria-label*="Close"]' },
      { kind: 'css', css: 'mat-dialog-container button[aria-label*="Đóng"]' },
    ],
  },
  notebookTitleDisplay: {
    key: 'notebookTitleDisplay',
    description: 'Visible notebook title',
    strategies: [
      { kind: 'testId', testId: 'notebook-title' },
      { kind: 'css', css: '[data-notebook-title-display]' },
      { kind: 'css', css: 'input.title-input' },
      { kind: 'role', role: 'heading', name: /.+/ },
    ],
  },
  addSourceButton: {
    key: 'addSourceButton',
    description: 'Add sources to notebook',
    strategies: [
      { kind: 'testId', testId: 'add-source' },
      { kind: 'css', css: "button[aria-label='Add source']" },
      { kind: 'css', css: "button[aria-label*='Add source']" },
      { kind: 'css', css: "button[aria-label*='Thêm nguồn']" },
      {
        kind: 'role',
        role: 'button',
        name: /add source|add sources|\+ add sources|\+ add|thêm nguồn|^\+$/i,
      },
      { kind: 'text', text: /thêm nguồn|add sources|\+ add/i },
      { kind: 'css', css: '[data-action="add-source"]' },
    ],
  },
  driveSourceOption: {
    key: 'driveSourceOption',
    description: 'Google Drive source option',
    strategies: [
      { kind: 'testId', testId: 'source-drive' },
      { kind: 'role', role: 'button', name: /google drive|^drive$|ổ đĩa/i },
      { kind: 'text', text: /^drive$/i },
      { kind: 'text', text: /google drive/i },
      { kind: 'css', css: '[data-source-type="drive"]' },
    ],
  },
  uploadFilesOption: {
    key: 'uploadFilesOption',
    description: 'Upload local files source option',
    strategies: [
      { kind: 'testId', testId: 'source-upload' },
      { kind: 'css', css: '[data-source-type="upload"]' },
      {
        kind: 'role',
        role: 'button',
        name: /upload|tải lên|tải tệp|from (your )?computer|máy tính|pdf|markdown|\.md/i,
      },
      { kind: 'text', text: /upload (a )?source|tải lên|upload files|from computer/i },
      { kind: 'css', css: '.cdk-overlay-pane button:has([iconname="upload"])' },
      { kind: 'css', css: '.cdk-overlay-pane [role="button"]:has([iconname="upload"])' },
      { kind: 'css', css: '[iconname="upload"]' },
    ],
  },
  fileInput: {
    key: 'fileInput',
    description: 'Hidden file input for local source upload',
    strategies: [
      { kind: 'testId', testId: 'source-file-input' },
      { kind: 'css', css: 'input[data-source-file-input]' },
      { kind: 'css', css: '.cdk-overlay-pane input[type="file"]' },
      { kind: 'css', css: 'mat-dialog-container input[type="file"]' },
      { kind: 'css', css: 'input[type="file"][accept*="markdown"]' },
      { kind: 'css', css: 'input[type="file"][accept*=".md"]' },
      { kind: 'css', css: 'input[type="file"]' },
    ],
  },
  copiedTextOption: {
    key: 'copiedTextOption',
    description: 'Copied / pasted text source option',
    strategies: [
      { kind: 'testId', testId: 'source-copied-text' },
      // Official VI help label: "Văn bản đã sao chép và dán"
      {
        kind: 'role',
        role: 'button',
        name: /copied text|paste text|pasted text|văn bản đã sao chép và dán|văn bản đã sao chép|dán văn bản|sao chép và dán|content.?paste/i,
      },
      {
        kind: 'text',
        text: /copied text|paste text|văn bản đã sao chép và dán|văn bản đã sao chép|dán văn bản|pasted text/i,
      },
      { kind: 'css', css: '[data-source-type="copied-text"]' },
      { kind: 'css', css: '.cdk-overlay-pane button:has([iconname="content_paste"])' },
      { kind: 'css', css: '.cdk-overlay-pane [role="button"]:has([iconname="content_paste"])' },
      { kind: 'css', css: '[iconname="content_paste"]' },
    ],
  },
  copiedTextTitle: {
    key: 'copiedTextTitle',
    description: 'Required title for pasted-text source (live Gemini Notebook)',
    strategies: [
      { kind: 'testId', testId: 'copied-text-title' },
      { kind: 'css', css: 'input[data-copied-text-title]' },
      { kind: 'css', css: '.cdk-overlay-pane input[type="text"]' },
      { kind: 'css', css: 'mat-dialog-container input[type="text"]' },
      { kind: 'placeholder', placeholder: /title|tiêu đề|name your source|đặt tên/i },
      {
        kind: 'label',
        label: /^title$|^source title$|^tiêu đề$|^tên nguồn$/i,
      },
    ],
  },
  copiedTextInput: {
    key: 'copiedTextInput',
    description: 'Pasted text body in add-source modal',
    strategies: [
      { kind: 'testId', testId: 'copied-text-input' },
      { kind: 'css', css: 'textarea[data-copied-text]' },
      // Prefer real textareas in the open overlay (avoid page chrome buttons)
      { kind: 'css', css: '.cdk-overlay-pane textarea' },
      { kind: 'css', css: 'mat-dialog-container textarea' },
      { kind: 'css', css: "textarea[aria-label='Pasted text']" },
      { kind: 'css', css: "textarea[placeholder='Paste text here']" },
      { kind: 'css', css: 'textarea[aria-label*="Paste" i]' },
      { kind: 'css', css: 'textarea[aria-label*="Dán" i]' },
      { kind: 'css', css: 'textarea[placeholder*="Paste" i]' },
      { kind: 'css', css: 'textarea[placeholder*="Dán" i]' },
      {
        kind: 'placeholder',
        placeholder: /paste text|dán văn bản|paste here|dán vào đây/i,
      },
      // Do NOT use bare "nội dung" / "content" — matches "Sao chép nội dung tóm tắt" buttons
      {
        kind: 'label',
        label: /^pasted text$|^copied text$|^paste text$|^dán văn bản/i,
      },
      { kind: 'role', role: 'textbox', name: /pasted text|paste text|dán văn bản|copied text/i },
    ],
  },
  sourceList: {
    key: 'sourceList',
    description: 'Attached sources list',
    strategies: [
      { kind: 'testId', testId: 'source-list' },
      { kind: 'css', css: '[data-source-list]' },
      { kind: 'css', css: '.single-source-container' },
    ],
  },
  sourceItem: {
    key: 'sourceItem',
    description: 'Single attached source',
    strategies: [
      { kind: 'testId', testId: 'source-item' },
      { kind: 'css', css: '[data-source-item]' },
      { kind: 'css', css: '.single-source-container' },
    ],
  },
  confirmAddSource: {
    key: 'confirmAddSource',
    description: 'Confirm add-source dialog (not the Add source opener)',
    strategies: [
      { kind: 'testId', testId: 'confirm-add-source' },
      { kind: 'role', role: 'button', name: /^add$|^insert$|^chèn$|^thêm$/i },
      { kind: 'text', text: /^insert$|^chèn$|^thêm$/i },
      { kind: 'css', css: "mat-dialog-container button[aria-label*='Insert']" },
      { kind: 'css', css: "mat-dialog-container button[aria-label*='Chèn']" },
      { kind: 'css', css: '[data-action="confirm-add-source"]' },
    ],
  },
  configureNotebookButton: {
    key: 'configureNotebookButton',
    description: 'Open Configure notebook / chat settings',
    strategies: [
      { kind: 'css', css: "button[aria-label='Configure notebook']" },
      { kind: 'css', css: "button[aria-label='Configure chat']" },
      { kind: 'css', css: "button[aria-label*='Configure notebook']" },
      { kind: 'css', css: "button[aria-label*='Configure chat']" },
      { kind: 'css', css: "button[aria-label*='Cấu hình sổ']" },
      { kind: 'css', css: "button[aria-label*='Cấu hình trò chuyện']" },
      { kind: 'css', css: "button[aria-label*='Cấu hình']" },
      {
        kind: 'role',
        role: 'button',
        name: /configure notebook|configure chat|cấu hình sổ|cấu hình trò chuyện|cấu hình chat|notebook settings|cài đặt sổ/i,
      },
      { kind: 'text', text: /configure chat|cấu hình trò chuyện/i },
    ],
  },
  customGoalButton: {
    key: 'customGoalButton',
    description: 'Custom chat goal in configure modal',
    strategies: [
      { kind: 'css', css: "configure-notebook-settings button[aria-label='Custom button']" },
      { kind: 'css', css: "button[aria-label='Custom button']" },
      { kind: 'css', css: "button[aria-label*='Custom']" },
      { kind: 'css', css: "button[aria-label*='Tuỳ chỉnh']" },
      { kind: 'css', css: "button[aria-label*='Tùy chỉnh']" },
      {
        kind: 'role',
        role: 'button',
        name: /^custom$|^custom button$|tuỳ chỉnh|tùy chỉnh/i,
      },
      { kind: 'text', text: /^custom$|^tuỳ chỉnh$|^tùy chỉnh$/i },
    ],
  },
  instructionsEditor: {
    key: 'instructionsEditor',
    description: 'Custom instructions / system prompt field',
    strategies: [
      { kind: 'testId', testId: 'notebook-instructions' },
      { kind: 'css', css: 'textarea[data-notebook-instructions]' },
      { kind: 'css', css: 'configure-notebook-settings textarea' },
      { kind: 'css', css: '.prompt-section textarea' },
      { kind: 'css', css: '.cdk-overlay-pane configure-notebook-settings textarea' },
      { kind: 'css', css: '.cdk-overlay-pane textarea' },
      { kind: 'css', css: 'mat-dialog-container textarea' },
      {
        kind: 'placeholder',
        placeholder: /instructions|custom|hướng dẫn|nhập hướng dẫn|add instructions|describe/i,
      },
      {
        kind: 'label',
        label: /^instructions$|^custom instructions$|^hướng dẫn$|^hướng dẫn tùy chỉnh/i,
      },
      {
        kind: 'role',
        role: 'textbox',
        name: /instructions|custom|hướng dẫn/i,
      },
    ],
  },
  saveInstructionsButton: {
    key: 'saveInstructionsButton',
    description: 'Save instructions',
    strategies: [
      { kind: 'testId', testId: 'save-instructions' },
      { kind: 'css', css: "configure-notebook-settings button[aria-label*='Save settings']" },
      { kind: 'css', css: "button[aria-label*='Save settings']" },
      { kind: 'css', css: "button[aria-label*='Lưu cài đặt']" },
      { kind: 'css', css: "button[aria-label*='Lưu']" },
      {
        kind: 'role',
        role: 'button',
        name: /save settings|save|apply|done|lưu cài đặt|^lưu$/i,
      },
      { kind: 'css', css: '[data-action="save-instructions"]' },
    ],
  },
  assistedGuideBanner: {
    key: 'assistedGuideBanner',
    description: 'Assisted setup guide banner (fixture / overlay)',
    strategies: [
      { kind: 'testId', testId: 'assisted-guide' },
      { kind: 'css', css: '[data-assisted-guide]' },
    ],
  },
} as const satisfies Record<string, SelectorEntry>;

export type NotebookSelectorKey = keyof typeof GOOGLE_NOTEBOOK_SELECTORS;

export class NotebookSelectorRegistry {
  constructor(
    private readonly page: Page,
    private readonly diagnosticsDir: string,
  ) {}

  private strategiesFor(key: NotebookSelectorKey): SelectorStrategy[] {
    const entry = GOOGLE_NOTEBOOK_SELECTORS[key];
    const override = getOverrideForSelector('google-notebook', key);
    return mergeStrategies(
      [...entry.strategies],
      override?.strategies,
      override?.mode ?? 'prepend',
    );
  }

  async resolve(
    key: NotebookSelectorKey,
    options?: { timeoutMs?: number; visible?: boolean; editable?: boolean },
  ): Promise<Locator> {
    const entry = GOOGLE_NOTEBOOK_SELECTORS[key];
    const timeoutMs = options?.timeoutMs ?? 2_500;
    const errors: string[] = [];
    const strategies = this.strategiesFor(key);
    const candidates = strategies.map(describeStrategy);

    for (const strategy of strategies) {
      const locator = locatorFromStrategy(this.page, strategy);
      try {
        const target = locator.first();
        await target.waitFor({
          state: options?.visible === false ? 'attached' : 'visible',
          timeout: timeoutMs,
        });
        if (options?.editable) {
          const fillable = await isFillableLocator(target);
          if (!fillable) {
            errors.push(`${describeStrategy(strategy)}: visible but not fillable`);
            continue;
          }
        }
        return target;
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
      `Notebook selector not found: ${entry.key} (${entry.description}). Tried: ${errors.join(' | ')}`,
      diagnostics,
    );
  }

  async tryResolve(
    key: NotebookSelectorKey,
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

  async count(key: NotebookSelectorKey): Promise<number> {
    for (const strategy of this.strategiesFor(key)) {
      const locator = locatorFromStrategy(this.page, strategy);
      try {
        const n = await locator.count();
        if (n > 0) return n;
      } catch {
        // try next
      }
    }
    return 0;
  }

  /** Dynamic Drive file row in source picker (name from project Drive layout). */
  driveFileLocator(sourceName: string): Locator {
    const escaped = sourceName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return this.page
      .getByTestId(`drive-file-${sourceName}`)
      .or(this.page.locator(`[data-drive-file="${escaped}"]`));
  }

  notebookItemLocator(name?: string): Locator {
    const liveCards = this.page
      .locator('mat-card[role="button"]:has(h3)')
      .or(this.page.locator("a[href*='/notebook/']"))
      .or(this.page.locator('[id^="project-"]'))
      .or(this.page.locator('[class*="project-button"]'))
      .or(this.page.locator('[class*="project-card"]'));
    if (!name) {
      return this.page
        .getByTestId('notebook-item')
        .or(this.page.locator('[data-notebook-item]'))
        .or(liveCards);
    }
    const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return this.page
      .locator(`[data-notebook-item][data-notebook-name="${escaped}"]`)
      .or(this.page.getByTestId('notebook-item').filter({ hasText: name }))
      .or(this.page.locator('mat-card[role="button"]').filter({ hasText: name }))
      .or(this.page.locator("a[href*='/notebook/']").filter({ hasText: name }))
      .or(this.page.locator('[id^="project-"]').filter({ hasText: name }))
      .or(this.page.locator('[class*="project-card"]').filter({ hasText: name }));
  }

  sourceItemLocators(): Locator {
    return this.page
      .getByTestId('source-item')
      .or(this.page.locator('[data-source-item]'))
      .or(this.page.locator('.single-source-container'));
  }
}

async function isFillableLocator(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'select') return true;
      if (tag === 'input') {
        const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
        return !['button', 'submit', 'checkbox', 'radio', 'file', 'image', 'reset', 'hidden'].includes(
          type,
        );
      }
      if ((el as HTMLElement).isContentEditable) return true;
      const role = el.getAttribute('role');
      return role === 'textbox' || role === 'searchbox' || role === 'combobox';
    })
    .catch(() => false);
}
