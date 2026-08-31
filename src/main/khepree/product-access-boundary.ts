import { app } from 'electron';
import { KHEPREE_FEATURES } from '@shared/constants/khepree';
import { KhepreeProductAccessDeniedError } from './errors';

/** Injectable licensing boundary — fail-closed when enforcer unset in packaged builds. */
let assertProductAccessImpl: ((feature?: string) => void) | null = null;

export function setKhepreeProductAccessEnforcer(
  impl: ((feature?: string) => void) | null,
): void {
  assertProductAccessImpl = impl;
}

export function assertKhepreeProductAccess(feature?: string): void {
  if (assertProductAccessImpl) {
    assertProductAccessImpl(feature);
    return;
  }
  if (app?.isPackaged) {
    throw new KhepreeProductAccessDeniedError(feature ?? KHEPREE_FEATURES.translation);
  }
}

export function resetKhepreeProductAccessEnforcer(): void {
  assertProductAccessImpl = null;
}
