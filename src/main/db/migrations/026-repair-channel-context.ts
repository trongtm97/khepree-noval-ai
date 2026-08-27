/**
 * job_attempts: persist AI channel used per repair/continuation attempt.
 * SOURCE_PRESENT-style name checks are not enough — store provider + notebook + pack.
 */
export const MIGRATION_026_REPAIR_CHANNEL_CONTEXT = `
ALTER TABLE job_attempts ADD COLUMN provider_type TEXT;
ALTER TABLE job_attempts ADD COLUMN account_id TEXT;
ALTER TABLE job_attempts ADD COLUMN notebook_id TEXT;
ALTER TABLE job_attempts ADD COLUMN thread_ref TEXT;
ALTER TABLE job_attempts ADD COLUMN pack_mode TEXT;
ALTER TABLE job_attempts ADD COLUMN knowledge_version INTEGER;
`;
