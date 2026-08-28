/** Pick display fields from linked AI accounts. Empty list is valid (Official / unused backends). */
export function summarizeLinkedAiAccount(
  accounts: {
    status: string;
    google_email: string | null;
    last_used_at: string | null;
    last_error: string | null;
  }[],
): {
  accountEmail: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
} {
  const ready = accounts.find((a) => a.status === 'READY') ?? accounts.at(0);
  if (!ready) {
    return { accountEmail: null, lastUsedAt: null, lastError: null };
  }
  return {
    accountEmail: ready.google_email,
    lastUsedAt: ready.last_used_at,
    lastError: ready.last_error,
  };
}
