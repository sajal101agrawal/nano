-- 007_staffing_portal.sql
-- Staffing company portal: companies, users, resources, profiles, skills

-- ─── Staffing Companies ───────────────────────────────────────────────────────
CREATE TABLE staffing_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  domain TEXT,
  website TEXT,
  industry TEXT,
  notes TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staffing_companies_name_trgm ON staffing_companies USING gin (name gin_trgm_ops);
CREATE INDEX idx_staffing_companies_domain ON staffing_companies (domain);

-- ─── Staffing Users ───────────────────────────────────────────────────────────
CREATE TABLE staffing_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES staffing_companies (id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  designation TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staffing_users_email ON staffing_users (email);
CREATE INDEX idx_staffing_users_company ON staffing_users (company_id);

-- ─── Staffing Resources ───────────────────────────────────────────────────────
CREATE TABLE staffing_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES staffing_companies (id) ON DELETE CASCADE,
  added_by UUID REFERENCES staffing_users (id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  current_title TEXT,
  current_company TEXT,
  total_experience_years NUMERIC(4,1),
  location TEXT,
  work_mode TEXT,
  skills TEXT[],
  availability_status TEXT NOT NULL DEFAULT 'unknown' CHECK (availability_status IN ('available', 'unavailable', 'unknown')),
  expected_rate TEXT,
  rate_currency TEXT DEFAULT 'USD',
  notice_period_days INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staffing_resources_company ON staffing_resources (company_id);
CREATE INDEX idx_staffing_resources_added_by ON staffing_resources (added_by);
CREATE INDEX idx_staffing_resources_availability ON staffing_resources (availability_status);
CREATE INDEX idx_staffing_resources_status ON staffing_resources (status);
CREATE INDEX idx_staffing_resources_name_trgm ON staffing_resources USING gin (full_name gin_trgm_ops) WHERE full_name IS NOT NULL;
CREATE INDEX idx_staffing_resources_skills ON staffing_resources USING gin (skills);

-- ─── Staffing Resource Profiles (versioned CVs) ───────────────────────────────
CREATE TABLE staffing_resource_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES staffing_resources (id) ON DELETE CASCADE,
  raw_cv_url TEXT,
  raw_cv_filename TEXT,
  raw_cv_size_bytes INTEGER,
  parsed_json JSONB,
  summary TEXT,
  total_experience_years NUMERIC(4,1),
  current_title TEXT,
  current_company TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed', 'review_required')),
  parse_error TEXT,
  embedding vector(1536),
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_srp_resource ON staffing_resource_profiles (resource_id);
CREATE INDEX idx_srp_current ON staffing_resource_profiles (resource_id, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_srp_parse_status ON staffing_resource_profiles (parse_status);
CREATE INDEX idx_srp_embedding ON staffing_resource_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Staffing Resource Skills ─────────────────────────────────────────────────
CREATE TABLE staffing_resource_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES staffing_resources (id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  skill_normalized TEXT NOT NULL,
  years NUMERIC(4,1),
  proficiency TEXT CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_srs_resource ON staffing_resource_skills (resource_id);
CREATE INDEX idx_srs_normalized ON staffing_resource_skills (skill_normalized);
CREATE INDEX idx_srs_skill_trgm ON staffing_resource_skills USING gin (skill gin_trgm_ops);
