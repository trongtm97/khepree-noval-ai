/**
 * Extend gemini_requests for resumable / idempotent lifecycle.
 * Coarse `status` kept for older readers; `lifecycle` is source of truth.
 */
export const MIGRATION_023_GEMINI_REQUEST_LIFECYCLE = `
ALTER TABLE gemini_requests ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'CREATED';
ALTER TABLE gemini_requests ADD COLUMN marker TEXT;
ALTER TABLE gemini_requests ADD COLUMN thread_ref TEXT;
ALTER TABLE gemini_requests ADD COLUMN notebook_id TEXT;
ALTER TABLE gemini_requests ADD COLUMN lifecycle_at TEXT;

UPDATE gemini_requests SET lifecycle = CASE status
  WHEN 'pending' THEN 'CREATED'
  WHEN 'running' THEN 'GENERATION_STARTED'
  WHEN 'completed' THEN 'COMPLETED'
  WHEN 'failed' THEN 'FAILED'
  WHEN 'cancelled' THEN 'FAILED'
  ELSE 'CREATED'
END
WHERE lifecycle = 'CREATED' OR lifecycle IS NULL OR lifecycle = '';

UPDATE gemini_requests SET marker = '[NTS-CORR:' || correlation_id || ']'
WHERE marker IS NULL OR marker = '';

CREATE INDEX IF NOT EXISTS idx_gemini_requests_lifecycle ON gemini_requests(lifecycle);
CREATE INDEX IF NOT EXISTS idx_gemini_requests_job ON gemini_requests(job_id);
`;
