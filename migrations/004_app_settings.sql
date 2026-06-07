-- 004_app_settings.sql
-- Agency branding settings used for client-facing CV generation

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults (all empty — admins fill these in)
INSERT INTO app_settings (key, value) VALUES
  ('agency_name',    ''),
  ('agency_tagline', ''),
  ('agency_email',   ''),
  ('agency_phone',   ''),
  ('agency_website', ''),
  ('agency_address', '')
ON CONFLICT (key) DO NOTHING;
