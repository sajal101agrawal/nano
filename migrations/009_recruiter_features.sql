-- 009_recruiter_features.sql
-- Comprehensive recruiter workflow features:
-- seen/unseen tracking, activity log, notes, ratings, tags,
-- pipeline stages (kanban), interviews, follow-up reminders,
-- job assignments, saved searches, talent pools, stage automations

-- ─── 1. Application seen/unseen tracking ─────────────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID;

CREATE INDEX IF NOT EXISTS idx_applications_seen ON applications (seen_at) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_applications_rating ON applications (rating);

-- ─── 2. Application activity log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS application_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,   -- 'status_changed', 'stage_changed', 'shortlisted', 'note_added', 'rated', 'tagged', 'seen', 'interview_scheduled'
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_application ON application_activity_log (application_id);
CREATE INDEX IF NOT EXISTS idx_activity_requirement ON application_activity_log (requirement_id);
CREATE INDEX IF NOT EXISTS idx_activity_candidate ON application_activity_log (candidate_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON application_activity_log (created_at DESC);

-- ─── 3. Candidate notes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications (id) ON DELETE SET NULL,
  requirement_id UUID REFERENCES requirements (id) ON DELETE SET NULL,
  author_id UUID REFERENCES users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_candidate ON candidate_notes (candidate_id);
CREATE INDEX IF NOT EXISTS idx_notes_application ON candidate_notes (application_id);
CREATE INDEX IF NOT EXISTS idx_notes_author ON candidate_notes (author_id);

-- ─── 4. Candidate tags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  color TEXT DEFAULT 'gray',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_candidate ON candidate_tags (candidate_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON candidate_tags (tag);

-- ─── 5. Pipeline stages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requirement_id UUID REFERENCES requirements (id) ON DELETE CASCADE,  -- NULL = global default template
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',    -- blue, green, amber, red, purple, gray
  sort_order INTEGER NOT NULL DEFAULT 0,
  maps_to_status TEXT,                   -- optional mapping to application.status value
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stages_requirement ON pipeline_stages (requirement_id);
CREATE INDEX IF NOT EXISTS idx_stages_sort ON pipeline_stages (requirement_id, sort_order);

-- Add FK now that pipeline_stages exists
ALTER TABLE applications
  ADD CONSTRAINT fk_applications_stage
  FOREIGN KEY (pipeline_stage_id) REFERENCES pipeline_stages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_stage ON applications (pipeline_stage_id);

-- Seed default pipeline stages (global template, requirement_id = NULL)
INSERT INTO pipeline_stages (name, color, sort_order, maps_to_status, is_default) VALUES
  ('Applied',      'gray',   1, 'applied',       TRUE),
  ('Screening',    'blue',   2, 'shortlisted',   TRUE),
  ('Interview',    'purple', 3, 'in_discussion', TRUE),
  ('Offer',        'amber',  4, 'offered',       TRUE),
  ('Hired',        'green',  5, 'placed',        TRUE),
  ('Rejected',     'red',    6, 'rejected',      TRUE)
ON CONFLICT DO NOTHING;

-- ─── 6. Stage automations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES pipeline_stages (id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL DEFAULT 'enter',   -- 'enter' | 'exit'
  template_id UUID REFERENCES templates (id) ON DELETE SET NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_stage ON stage_automations (stage_id);

-- ─── 7. Interviews ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  interview_type TEXT NOT NULL DEFAULT 'video' CHECK (interview_type IN ('video', 'phone', 'onsite', 'technical', 'hr')),
  round_number INTEGER NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  location TEXT,        -- video URL or address
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews (application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_requirement ON interviews (requirement_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON interviews (candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON interviews (scheduled_at);

-- ─── 8. Interview interviewers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_interviewers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES interviews (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  response_status TEXT NOT NULL DEFAULT 'pending' CHECK (response_status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interview_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_interviewers_interview ON interview_interviewers (interview_id);
CREATE INDEX IF NOT EXISTS idx_interviewers_user ON interview_interviewers (user_id);

-- ─── 9. Interview scorecards ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_scorecards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES interviews (id) ON DELETE CASCADE,
  interviewer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  criteria_json JSONB,     -- [{name, rating 1-5, comment}]
  overall_rating SMALLINT CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)),
  recommendation TEXT CHECK (recommendation IN ('strong_yes', 'yes', 'maybe', 'no', 'strong_no')),
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interview_id, interviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_scorecards_interview ON interview_scorecards (interview_id);

-- ─── 10. Follow-up reminders ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications (id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES requirements (id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users (id) ON DELETE SET NULL,
  note TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_candidate ON follow_up_reminders (candidate_id);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned ON follow_up_reminders (assigned_to);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON follow_up_reminders (due_at) WHERE completed_at IS NULL;

-- ─── 11. Job assignments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requirement_id UUID NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users (id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requirement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_requirement ON job_assignments (requirement_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON job_assignments (user_id);

-- ─── 12. Saved searches ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query_params_json JSONB NOT NULL DEFAULT '{}',
  notify_on_new_match BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ,
  last_match_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);

-- ─── 13. Talent pools ────────────────────────────────────────────────────────
-- The pool_members table already partially exists via staffing
-- but we need a proper named pools system
CREATE TABLE IF NOT EXISTS talent_pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS talent_pool_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES talent_pools (id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  added_by UUID REFERENCES users (id) ON DELETE SET NULL,
  notes TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pool_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_members_pool ON talent_pool_members (pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_members_candidate ON talent_pool_members (candidate_id);

-- ─── 14. User notification preferences ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE UNIQUE,
  new_application_inapp BOOLEAN NOT NULL DEFAULT TRUE,
  new_application_email BOOLEAN NOT NULL DEFAULT FALSE,
  parse_failed_inapp BOOLEAN NOT NULL DEFAULT TRUE,
  parse_failed_email BOOLEAN NOT NULL DEFAULT FALSE,
  availability_changed_inapp BOOLEAN NOT NULL DEFAULT TRUE,
  availability_changed_email BOOLEAN NOT NULL DEFAULT FALSE,
  email_reply_inapp BOOLEAN NOT NULL DEFAULT TRUE,
  email_reply_email BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_inapp BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_email BOOLEAN NOT NULL DEFAULT TRUE,
  digest_frequency TEXT NOT NULL DEFAULT 'never' CHECK (digest_frequency IN ('never', 'daily', 'weekly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 15. Job requirement extras ──────────────────────────────────────────────
ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  ADD COLUMN IF NOT EXISTS target_fill_date DATE,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 16. Updated_at triggers for new tables ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'candidate_notes',
    'interviews',
    'interview_scorecards',
    'saved_searches',
    'talent_pools',
    'user_notification_preferences'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_' || t || '_updated'
        AND tgrelid = t::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
        t, t
      );
    END IF;
  END LOOP;
END
$$;

-- Application status token for candidate self-service page
ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_token UUID DEFAULT gen_random_uuid() UNIQUE;
CREATE INDEX IF NOT EXISTS idx_applications_status_token ON applications(status_token);
