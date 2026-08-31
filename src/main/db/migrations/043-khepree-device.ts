export const MIGRATION_043_KHEPREE_DEVICE = `
-- Khepree device metadata (non-secret — secrets stay in safeStorage)
CREATE TABLE IF NOT EXISTS khepree_device_audit (
  id          TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  metadata_json TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_khepree_device_audit_created
  ON khepree_device_audit(created_at);
`;
