/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusbarContactLinks } from '../../../src/renderer/components/contact/StatusbarContactLinks';
import { useLocaleStore } from '../../../src/renderer/i18n';

const openOfficialContactMock = vi.fn();

beforeEach(() => {
  useLocaleStore.setState({ preference: 'vi' });
  openOfficialContactMock.mockReset();
  openOfficialContactMock.mockResolvedValue({ ok: true });
  Object.defineProperty(window, 'khepreeNovelAI', {
    configurable: true,
    writable: true,
    value: {
      openOfficialContact: openOfficialContactMock,
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('StatusbarContactLinks', () => {
  it('renders five contact buttons in the status bar group', () => {
    render(<StatusbarContactLinks />);
    expect(screen.getByRole('group', { name: 'Liên hệ Khepree Labs' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByText('Khepree Labs')).toBeTruthy();
  });
});
