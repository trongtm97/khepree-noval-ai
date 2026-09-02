/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useLocaleStore } from '../../../src/renderer/i18n';
import { KhepreeTabs } from '../../../src/renderer/features/khepree/components/KhepreeTabs';
import { KhepreeAccountPage } from '../../../src/renderer/features/khepree/pages/KhepreeAccountPage';
import {
  formatKhepreeDevicesCount,
  formatKhepreeProductDisplayName,
} from '../../../src/renderer/features/khepree/khepree-display';
import type { KhepreeAccessState } from '@shared/schemas/khepree';

const tVi = (key: string, params?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    'khepree.hub.title': 'Khepree',
    'khepree.nav.account': 'Tài khoản của tôi',
    'khepree.nav.plan': 'Gói của tôi',
    'khepree.nav.devices': 'Thiết bị',
    'khepree.nav.about': 'Giới thiệu Khepree',
    'khepree.account.title': 'Tài khoản của tôi',
    'khepree.account.notSignedIn': 'Đăng nhập để xem thông tin tài khoản Khepree.',
    'khepree.login.action': 'Đăng nhập bằng Khepree',
    'khepree.account.connected': 'Đã kết nối với Khepree',
    'khepree.account.productDisplayName': 'Khepree Novel AI',
    'khepree.account.sectionSubscription': 'Gói đăng ký',
    'khepree.account.sectionAccess': 'Truy cập & thiết bị',
    'khepree.account.product': 'Sản phẩm',
    'khepree.account.currentPlan': 'Gói hiện tại',
    'khepree.account.entitlement': 'Quyền sử dụng',
    'khepree.account.access': 'Quyền truy cập',
    'khepree.account.devices': 'Thiết bị',
    'khepree.account.renewal': 'Gia hạn',
    'khepree.account.upgradePlan': 'Nâng cấp gói',
    'khepree.account.manageDevices': 'Quản lý thiết bị',
    'khepree.account.openAccount': 'Mở tài khoản Khepree',
    'khepree.account.signOut': 'Đăng xuất',
    'khepree.menu.noPlan': 'Chưa có gói',
    'khepree.devices.unavailable': 'Chưa có dữ liệu',
    'khepree.account.devicesCount': 'Đang dùng {used} / {max}',
    'khepree.entitlementState.none': 'Free',
    'khepree.accessStatus.FREE': 'Free',
  };
  const template = map[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''));
};

const signedInState: KhepreeAccessState = {
  status: 'FREE',
  loginPhase: null,
  signedIn: true,
  user: {
    id: 'u1',
    email: 'test@gmail.com',
    displayName: 'Trong Admin',
  },
  plan: { planId: 'free', planName: 'Free', status: 'none' },
  entitlement: 'none',
  billing: 'none',
  devicesUsed: null,
  devicesMax: null,
  features: {},
  leaseValid: false,
  leaseExpiresAt: null,
  graceUntil: null,
  heartbeatStatus: null,
  error: null,
  canStartTranslation: false,
  canUseWorkspace: true,
  checkoutPhase: 'idle',
  checkoutPlanId: null,
  checkoutCanReopen: false,
  checkoutError: null,
};

beforeEach(() => {
  useLocaleStore.setState({ preference: 'vi' });
  Object.defineProperty(window, 'khepreeNovelAI', {
    configurable: true,
    writable: true,
    value: {
      khepree: {
        startLogin: vi.fn(),
        signOut: vi.fn(),
        getAccessState: vi.fn().mockResolvedValue(signedInState),
        onAccessState: vi.fn(() => {
          return () => undefined;
        }),
      },
      openOfficialContact: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('Khepree hub UI', () => {
  it('renders four horizontal tabs', () => {
    render(
      <MemoryRouter initialEntries={['/khepree/account']}>
        <KhepreeTabs />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Tài khoản của tôi' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gói của tôi' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Thiết bị' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Giới thiệu Khepree' })).toBeTruthy();
  });

  it('marks active tab for current route', () => {
    render(
      <MemoryRouter initialEntries={['/khepree/plan']}>
        <KhepreeTabs />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Gói của tôi' }).className).toContain(
      'khepree-hub__tab--active',
    );
  });

  it('does not render ? / ? when device counts are missing', async () => {
    render(
      <MemoryRouter initialEntries={['/khepree/account']}>
        <Routes>
          <Route path="/khepree/account" element={<KhepreeAccountPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Chưa có dữ liệu')).toBeTruthy();
    expect(screen.queryByText(/\? \/ \?/)).toBeNull();
  });

  it('uses customer-facing product display name', () => {
    expect(formatKhepreeProductDisplayName(tVi)).toBe('Khepree Novel AI');
  });

  it('formats missing device counts with semantic fallback', () => {
    expect(formatKhepreeDevicesCount(tVi, null, null)).toBe('Chưa có dữ liệu');
    expect(formatKhepreeDevicesCount(tVi, 1, null)).toBe('—');
    expect(formatKhepreeDevicesCount(tVi, 1, 2)).toBe('Đang dùng 1 / 2');
  });
});
