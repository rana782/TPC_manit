-- Document intelligence persistence (PostgreSQL 14+)

CREATE TABLE IF NOT EXISTS documents (
    document_id UUID PRIMARY KEY,
    user_id VARCHAR(255) NULL,
    storage_relative_path TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_documents_user_id ON documents (user_id);

CREATE TABLE IF NOT EXISTS jobs (
    job_id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
    status VARCHAR(64) NOT NULL DEFAULT 'queued',
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_jobs_document_id ON jobs (document_id);
CREATE INDEX IF NOT EXISTS ix_jobs_status_created_at ON jobs (status, created_at);

CREATE TABLE IF NOT EXISTS results (
    result_id UUID PRIMARY KEY,
    job_id UUID NOT NULL UNIQUE REFERENCES jobs (job_id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
    extracted_text TEXT NULL,
    nanonets_raw JSONB NULL,
    normalized_output JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_results_document_id ON results (document_id);

COMMENT ON TABLE jobs IS 'Lifecycle: queued -> processing -> completed | failed; retry re-queues failed jobs.';
COMMENT ON COLUMN jobs.retry_count IS 'Number of times this job was re-queued via the retry endpoint after failure.';
