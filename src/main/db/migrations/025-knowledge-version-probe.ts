/**
 * Pending knowledge version + nonce for Notebook CONTENT_CURRENT verification.
 * verifySources(names) only proves SOURCE_PRESENT — not this.
 */
export const MIGRATION_025_KNOWLEDGE_VERSION_PROBE = `
ALTER TABLE drive_sync_state ADD COLUMN pending_knowledge_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE drive_sync_state ADD COLUMN pending_sync_nonce TEXT;
ALTER TABLE drive_sync_state ADD COLUMN verified_knowledge_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE drive_sync_state ADD COLUMN verified_sync_nonce TEXT;
ALTER TABLE drive_sync_state ADD COLUMN version_probe_status TEXT NOT NULL DEFAULT 'pending';
`;
