/**
 * Legacy SQLite values — read compat for old databases and event logs only.
 * Do not emit these from new code paths.
 */
export const LEGACY_NOTEBOOK_BINDING_DRIVE_LIVE = 'DRIVE_LIVE' as const;

export const LEGACY_KNOWLEDGE_SYNC_PENDING_EVENT = 'NOTEBOOK_SYNC_PENDING' as const;

export const LEGACY_KNOWLEDGE_SYNC_EVENTS = [
  'DRIVE_SYNC_STARTED',
  'DRIVE_SYNC_COMPLETED',
  'DRIVE_SYNCED',
  LEGACY_KNOWLEDGE_SYNC_PENDING_EVENT,
] as const;

/** Map legacy knowledge_sync_events.event_type → current enum string. */
export function normalizeKnowledgeSyncEventType(eventType: string): string {
  switch (eventType) {
    case 'DRIVE_SYNC_STARTED':
      return 'KNOWLEDGE_SYNC_STARTED';
    case 'DRIVE_SYNC_COMPLETED':
      return 'KNOWLEDGE_SYNC_COMPLETED';
    case 'DRIVE_SYNCED':
      return 'KNOWLEDGE_SYNCED';
    case LEGACY_KNOWLEDGE_SYNC_PENDING_EVENT:
      return 'KNOWLEDGE_SYNC_PENDING';
    default:
      return eventType;
  }
}
