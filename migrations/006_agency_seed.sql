-- 006_agency_seed.sql
-- Pre-seed agency contact details

INSERT INTO app_settings (key, value) VALUES
  ('agency_name',    'Sajal Tech Talent'),
  ('agency_tagline', 'Connecting the best tech talent'),
  ('agency_email',   'contact@sajaltech.com'),
  ('agency_phone',   '+91 8440898969'),
  ('agency_website', 'sajaltech.com'),
  ('agency_address', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE app_settings.value = '';
