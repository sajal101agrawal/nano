-- Migration: Draft Applications
-- Stores partial/incomplete applications where the candidate uploaded a CV but didn't finish

CREATE TABLE IF NOT EXISTS draft_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  cv_url TEXT NOT NULL,
  cv_key TEXT NOT NULL,
  cv_filename TEXT,
  cv_size_bytes INTEGER,
  cv_mime_type TEXT,
  parsed_name TEXT,
  parsed_email TEXT,
  parsed_phone TEXT,
  candidate_name TEXT,
  candidate_email TEXT,
  candidate_phone TEXT,
  preferences JSONB,
  step TEXT NOT NULL DEFAULT 'upload',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'expired')),
  reminder_sent_15m BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_6h BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_draft_applications_status ON draft_applications(status);
CREATE INDEX idx_draft_applications_created ON draft_applications(created_at);
CREATE INDEX idx_draft_applications_requirement ON draft_applications(requirement_id);
CREATE INDEX idx_draft_applications_email ON draft_applications(parsed_email) WHERE parsed_email IS NOT NULL;
