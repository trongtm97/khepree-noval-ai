/**
 * Legacy SQLite enum values from pre-local-first Drive era.
 * Use only in migrations, legacy readers, and deprecation notices — not in new code paths.
 */
export { LEGACY_NOTEBOOK_BINDING_DRIVE_LIVE as LEGACY_BINDING_DRIVE_LIVE } from '@shared/constants/legacy-knowledge-events';

/** @deprecated Legacy knowledge_sync_events.event_type — read old rows only. */
export const LEGACY_EVENT_NOTEBOOK_SYNC_PENDING = 'NOTEBOOK_SYNC_PENDING' as const;
