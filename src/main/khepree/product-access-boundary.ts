/** Injectable licensing boundary — no-op until Khepree access service wires production enforcer. */
let assertProductAccessImpl: ((feature?: string) => void) | null = null;

export function setKhepreeProductAccessEnforcer(
  impl: ((feature?: string) => void) | null,
): void {
  assertProductAccessImpl = impl;
}

export function assertKhepreeProductAccess(feature?: string): void {
  assertProductAccessImpl?.(feature);
}

export function resetKhepreeProductAccessEnforcer(): void {
  assertProductAccessImpl = null;
}
