/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentProps } from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDto } from '@shared/schemas/import';
import { CompactProjectBar } from '../../../src/renderer/components/shell/CompactProjectBar';

const GLOBAL_CSS = readFileSync(
  resolve('src/renderer/styles/global.css'),
  'utf8',
);

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const EDITION_ID = '22222222-2222-4222-8222-222222222222';

const project: ProjectDto = {
  id: PROJECT_ID,
  title: 'Truyện 1',
  sourceLanguage: 'zh-Hans',
  targetLanguage: 'vi',
  genre: null,
  description: null,
  status: 'ready',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  activeEditionId: EDITION_ID,
};

function stubEditions() {
  Object.defineProperty(window, 'novelTrans', {
    configurable: true,
    writable: true,
    value: {
      editions: {
        list: vi.fn().mockResolvedValue({
          editions: [
            {
              id: EDITION_ID,
              projectId: PROJECT_ID,
              targetLanguage: 'vi',
              name: 'Tiếng Việt',
              status: 'active',
              styleConfig: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              isActive: true,
            },
          ],
        }),
      },
    },
  });
}

function renderBar(props: Partial<ComponentProps<typeof CompactProjectBar>> = {}) {
  return render(
    <MemoryRouter>
      <CompactProjectBar
        project={project}
        title="Truyện 1"
        projectId={PROJECT_ID}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('CompactProjectBar', () => {
  beforeEach(() => {
    stubEditions();
  });

  afterEach(() => {
    cleanup();
  });

  it('groups edition switcher and open-translator in actions cluster', async () => {
    renderBar();

    const actions = document.querySelector('.compact-project-bar__actions');
    expect(actions).not.toBeNull();
    expect(actions?.querySelector('.edition-switcher')).not.toBeNull();
    expect(actions?.querySelector('.compact-project-bar__open-translator')).not.toBeNull();
    expect(actions?.querySelector('.compact-project-bar__pair')).toBeNull();
    expect(document.querySelector('.compact-project-bar__pair')).not.toBeNull();

    await waitFor(() => {
      expect(document.querySelector('.edition-switcher select')).not.toBeNull();
    });
  });

  it('keeps actions cluster when translator button is hidden', () => {
    renderBar({ showOpenTranslator: false });

    const actions = document.querySelector('.compact-project-bar__actions');
    expect(actions?.querySelector('.edition-switcher')).not.toBeNull();
    expect(actions?.querySelector('.compact-project-bar__open-translator')).toBeNull();
  });

  it('does not cap bar height so edition controls cannot paint over tabs', () => {
    const bar = /\.compact-project-bar \{[^}]+\}/.exec(GLOBAL_CSS)?.[0];
    expect(bar).toBeTruthy();
    expect(bar).not.toMatch(/max-height/);
    expect(GLOBAL_CSS).toMatch(/\.edition-switcher \{[^}]*flex-wrap:\s*nowrap/);
    expect(GLOBAL_CSS).toMatch(/\.edition-switcher \.nt-select \{[^}]*width:\s*auto/);
  });
});
