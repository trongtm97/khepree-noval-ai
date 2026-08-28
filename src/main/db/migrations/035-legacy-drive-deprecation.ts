/**
 * Phase 2 — Google Drive removal (non-destructive).
 *
 * Legacy tables/columns retained for existing installs:
 * - drive_resources (DEPRECATED — no production reads)
 * - drive_sync_state (DEPRECATED name — use KnowledgeSyncStateRepository)
 * - knowledge_files.drive_file_id, last_drive_sync_at (DEPRECATED columns)
 * - google_accounts.drive_connected (DEPRECATED — not used for readiness)
 *
 * No SQL changes — documentation-only migration marker.
 */
export const MIGRATION_035_LEGACY_DRIVE_DEPRECATION = `
-- noop: Drive backend removed from production code; schema kept for legacy data
SELECT 1;
`;
