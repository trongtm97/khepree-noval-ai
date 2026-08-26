export function utcNow(): string {
  return new Date().toISOString();
}

export function touchTimestamps(): { created_at: string; updated_at: string } {
  const now = utcNow();
  return { created_at: now, updated_at: now };
}
