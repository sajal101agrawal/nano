-- 001_initial_schema.sql
-- Core schema for nano talent platform

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Users (admin operators) ─────────────────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'recruiter', 'viewer')),
  password_hash TEXT,
  totp_secret TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- ─── Clients & Recruiters ────────────────────────────────────────────────────
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recruiters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recruiters_client ON recruiters (client_id);
CREATE INDEX idx_recruiters_email ON recruiters (email);

-- ─── Candidates ──────────────────────────────────────────────────────────────
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  primary_email TEXT UNIQUE,
  primary_phone TEXT UNIQUE,
  full_name TEXT,
  location TEXT,
  headline TEXT,
  source TEXT NOT NULL DEFAULT 'inbound',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  availability_status TEXT NOT NULL DEFAULT 'unknown' CHECK (availability_status IN ('available', 'unavailable', 'unknown')),
  open_to_contract BOOLEAN,
  open_to_fulltime BOOLEAN,
  notice_period_days INTEGER,
  expected_rate TEXT,
  expected_rate_currency TEXT DEFAULT 'USD',
  work_mode TEXT,
  current_title TEXT,
  current_company TEXT,
  total_experience_years NUMERIC(4,1),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidates_email ON candidates (primary_email);
CREATE INDEX idx_candidates_phone ON candidates (primary_phone);
CREATE INDEX idx_candidates_availability ON candidates (availability_status);
CREATE INDEX idx_candidates_name_trgm ON candidates USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_candidates_status ON candidates (status);

-- ─── Candidate Profiles (versioned) ──────────────────────────────────────────
CREATE TABLE candidate_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  raw_cv_url TEXT,
  raw_cv_filename TEXT,
  raw_cv_size_bytes INTEGER,
  parsed_json JSONB,
  summary TEXT,
  total_experience_years NUMERIC(4,1),
  current_title TEXT,
  current_company TEXT,
  expected_rate TEXT,
  currency TEXT DEFAULT 'USD',
  notice_period_days INTEGER,
  open_to_contract BOOLEAN,
  open_to_fulltime BOOLEAN,
  work_mode TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed', 'review_required')),
  parse_error TEXT,
  embedding vector(1536),
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_candidate ON candidate_profiles (candidate_id);
CREATE INDEX idx_profiles_current ON candidate_profiles (candidate_id, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_profiles_parse_status ON candidate_profiles (parse_status);
CREATE INDEX idx_profiles_embedding ON candidate_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Candidate Skills ─────────────────────────────────────────────────────────
CREATE TABLE candidate_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  skill_normalized TEXT NOT NULL,
  years NUMERIC(4,1),
  proficiency TEXT CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_candidate ON candidate_skills (candidate_id);
CREATE INDEX idx_skills_normalized ON candidate_skills (skill_normalized);
CREATE INDEX idx_skills_skill_trgm ON candidate_skills USING gin (skill gin_trgm_ops);

-- ─── Requirements ────────────────────────────────────────────────────────────
CREATE TABLE requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  jd_raw TEXT NOT NULL,
  parsed_requirements_json JSONB,
  required_skills TEXT[],
  min_experience NUMERIC(4,1),
  location TEXT,
  work_mode TEXT CHECK (work_mode IN ('remote', 'onsite', 'hybrid', 'flexible')),
  engagement_type TEXT NOT NULL DEFAULT 'contract' CHECK (engagement_type IN ('contract', 'fulltime', 'both')),
  budget_min NUMERIC(12,2),
  budget_max NUMERIC(12,2),
  budget_currency TEXT DEFAULT 'USD',
  budget_period TEXT DEFAULT 'monthly' CHECK (budget_period IN ('hourly', 'daily', 'monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'on_hold', 'filled', 'closed')),
  public_slug TEXT UNIQUE NOT NULL,
  embedding vector(1536),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requirements_status ON requirements (status);
CREATE INDEX idx_requirements_slug ON requirements (public_slug);
CREATE INDEX idx_requirements_client ON requirements (client_id);
CREATE INDEX idx_requirements_embedding ON requirements USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Requirement Questions ───────────────────────────────────────────────────
CREATE TABLE requirement_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requirement_id UUID NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'select' CHECK (question_type IN ('text', 'select', 'boolean', 'multiselect')),
  options JSONB,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_requirement ON requirement_questions (requirement_id, sort_order);

-- ─── Applications ────────────────────────────────────────────────────────────
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requirement_id UUID NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  profile_id UUID REFERENCES candidate_profiles (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN (
    'applied', 'parsing', 'parsed', 'parse_failed',
    'shortlisted', 'contacted', 'in_discussion', 'offered', 'placed', 'rejected', 'withdrawn'
  )),
  match_score NUMERIC(5,2),
  vector_score NUMERIC(5,4),
  rule_score NUMERIC(5,4),
  match_rationale TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requirement_id, candidate_id)
);

CREATE INDEX idx_applications_requirement ON applications (requirement_id);
CREATE INDEX idx_applications_candidate ON applications (candidate_id);
CREATE INDEX idx_applications_status ON applications (status);
CREATE INDEX idx_applications_score ON applications (match_score DESC NULLS LAST);

-- ─── Application Answers ─────────────────────────────────────────────────────
CREATE TABLE application_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES requirement_questions (id) ON DELETE CASCADE,
  answer_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_answers_application ON application_answers (application_id);

-- ─── Availability Events ──────────────────────────────────────────────────────
CREATE TABLE availability_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('available', 'unavailable', 'unknown')),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('application', 'email_click', 'admin', 'system', 'expiry')),
  token TEXT UNIQUE,
  token_used BOOLEAN NOT NULL DEFAULT FALSE,
  requirement_id UUID REFERENCES requirements (id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX idx_availability_candidate ON availability_events (candidate_id);
CREATE INDEX idx_availability_token ON availability_events (token) WHERE token IS NOT NULL;
CREATE INDEX idx_availability_expires ON availability_events (expires_at) WHERE token_used = FALSE;

-- ─── Matches (pool-wide, beyond direct applicants) ───────────────────────────
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requirement_id UUID NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  score NUMERIC(5,2),
  vector_score NUMERIC(5,4),
  rule_score NUMERIC(5,4),
  rationale TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requirement_id, candidate_id)
);

CREATE INDEX idx_matches_requirement ON matches (requirement_id, score DESC NULLS LAST);
CREATE INDEX idx_matches_candidate ON matches (candidate_id);

-- ─── Prospects (external sourcing) ──────────────────────────────────────────
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL DEFAULT 'apollo',
  provider_profile_id TEXT,
  full_name TEXT,
  headline TEXT,
  current_company TEXT,
  location TEXT,
  public_profile_url TEXT,
  summary TEXT,
  enrichment_json JSONB,
  email TEXT,
  email_status TEXT CHECK (email_status IN ('found', 'not_found', 'unverifiable', 'bounced')),
  provenance_json JSONB,
  sourced_for_requirement_id UUID REFERENCES requirements (id) ON DELETE SET NULL,
  converted_to_candidate_id UUID REFERENCES candidates (id) ON DELETE SET NULL,
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prospects_email ON prospects (email) WHERE email IS NOT NULL;
CREATE INDEX idx_prospects_requirement ON prospects (sourced_for_requirement_id);
CREATE INDEX idx_prospects_provider ON prospects (provider, provider_profile_id);

-- ─── Templates ───────────────────────────────────────────────────────────────
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('candidate_outreach', 'shortlist_intro', 'availability_check', 'recruiter_profile_share', 'otp', 'confirmation', 'general')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[],
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Outreach Messages ────────────────────────────────────────────────────────
CREATE TABLE outreach_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type TEXT NOT NULL CHECK (target_type IN ('candidate', 'prospect', 'recruiter')),
  target_id UUID NOT NULL,
  requirement_id UUID REFERENCES requirements (id) ON DELETE SET NULL,
  template_id UUID REFERENCES templates (id) ON DELETE SET NULL,
  sent_by UUID REFERENCES users (id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  email_to TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'outreach' CHECK (stream IN ('transactional', 'availability', 'outreach')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'replied')),
  esp_message_id TEXT,
  thread_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_target ON outreach_messages (target_type, target_id);
CREATE INDEX idx_messages_requirement ON outreach_messages (requirement_id);
CREATE INDEX idx_messages_esp_id ON outreach_messages (esp_message_id);
CREATE INDEX idx_messages_thread ON outreach_messages (thread_id);
CREATE INDEX idx_messages_status ON outreach_messages (status);

-- ─── Email Events ────────────────────────────────────────────────────────────
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES outreach_messages (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'unsubscribed')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_email_events_message ON email_events (message_id);
CREATE INDEX idx_email_events_type ON email_events (event_type, occurred_at DESC);

-- ─── Suppression List ────────────────────────────────────────────────────────
CREATE TABLE suppression_list (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'complained', 'manual', 'gdpr_erasure')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppression_email ON suppression_list (email);

-- ─── OTP Tokens ──────────────────────────────────────────────────────────────
CREATE TABLE otp_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'phone')),
  code TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_otp_identifier ON otp_tokens (identifier, used, expires_at);
CREATE INDEX idx_otp_expires ON otp_tokens (expires_at);

-- ─── Audit Log ───────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log (action, created_at DESC);

-- ─── Admin Notifications ─────────────────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_application', 'parse_failed', 'availability_changed', 'email_reply', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id UUID,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, read, created_at DESC);

-- ─── Updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_requirements_updated BEFORE UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_applications_updated BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_prospects_updated BEFORE UPDATE ON prospects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
