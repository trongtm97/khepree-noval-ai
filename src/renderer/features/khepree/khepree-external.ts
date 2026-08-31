import type { KhepreeExternalLinkTarget } from '@shared/constants/khepree';

export function openKhepreeExternal(target: KhepreeExternalLinkTarget): void {
  void window.novelTrans.khepree.openExternal({ target });
}
