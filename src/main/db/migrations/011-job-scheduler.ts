export const MIGRATION_011_JOB_SCHEDULER = `
-- Durable queue + lease for crash-safe scheduling
ALTER TABLE jobs ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE jobs ADD COLUMN chapter_from INTEGER;
ALTER TABLE jobs ADD COLUMN chapter_to INTEGER;
ALTER TABLE jobs ADD COLUMN worker_mode TEXT NOT NULL DEFAULT 'POOL';
ALTER TABLE jobs ADD COLUMN pinned_account_id TEXT REFERENCES google_accounts(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN lease_owner TEXT;
ALTER TABLE jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE jobs ADD COLUMN scheduled_at TEXT;

-- Worker health for scheduler
ALTER TABLE worker_states ADD COLUMN health TEXT NOT NULL DEFAULT 'READY';
ALTER TABLE worker_states ADD COLUMN current_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE worker_states ADD COLUMN busy_since TEXT;
ALTER TABLE worker_states ADD COLUMN limited_until TEXT;
ALTER TABLE worker_states ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_queue
  ON jobs(state, priority ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_jobs_lease
  ON jobs(lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_worker_states_health
  ON worker_states(health, is_enabled, priority);
`;
