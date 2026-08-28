export const MIGRATION_036_CONTEXT_FINGERPRINT = `
ALTER TABLE gemini_requests ADD COLUMN context_fingerprint_json TEXT;
`;
