/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OfficialContactCards } from '../../../src/renderer/components/contact/OfficialContactCards';
import { useLocaleStore } from '../../../src/renderer/i18n';
import { OFFICIAL_CONTACTS } from '@shared/constants/official-contacts';

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

describe('OfficialContactCards', () => {
  it('renders all five channels with Vietnamese labels and display handles', () => {
    render(<OfficialContactCards />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
    expect(buttons[0]?.textContent).toContain(OFFICIAL_CONTACTS.facebook.display);
    expect(buttons[1]?.textContent).toContain(OFFICIAL_CONTACTS.youtube.display);
    expect(buttons[2]?.textContent).toContain(OFFICIAL_CONTACTS.tiktok.display);
    expect(buttons[3]?.textContent).toContain(OFFICIAL_CONTACTS.telegram.display);
    expect(buttons[4]?.textContent).toContain(OFFICIAL_CONTACTS.zalo.display);
    expect(screen.getByText('Điện thoại / Zalo')).toBeTruthy();
  });

  it('calls native bridge with channel id on click', () => {
    render(<OfficialContactCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở Facebook Khepree Labs' }));
    expect(openOfficialContactMock).toHaveBeenCalledWith('facebook');
  });

  it('uses English labels when locale is en', () => {
    useLocaleStore.setState({ preference: 'en' });
    render(<OfficialContactCards />);
    expect(screen.getByText('Phone / Zalo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Khepree Labs on Facebook' })).toBeTruthy();
  });
});
