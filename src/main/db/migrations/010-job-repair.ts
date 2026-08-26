export const MIGRATION_010_JOB_REPAIR = `
ALTER TABLE job_attempts ADD COLUMN reason TEXT;
ALTER TABLE job_attempts ADD COLUMN input_ref TEXT;
ALTER TABLE job_attempts ADD COLUMN output TEXT;
ALTER TABLE job_attempts ADD COLUMN result TEXT;

CREATE INDEX IF NOT EXISTS idx_job_attempts_reason ON job_attempts(reason);
`;
