/** Pick display fields from linked AI accounts. Empty list is valid (Official / unused backends). */
export function summarizeLinkedAiAccount(
  accounts: Array<{
    status: string;
    google_email: string | null;
    last_used_at: string | null;
    last_error: string | null;
  }>,
): {
  accountEmail: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
} {
  const ready = accounts.find((a) => a.status === 'READY') ?? accounts[0];
  return {
    accountEmail: ready?.google_email ?? null,
    lastUsedAt: ready?.last_used_at ?? null,
    lastError: ready?.last_error ?? null,
  };
}
