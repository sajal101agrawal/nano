-- 005_matches_manual.sql
-- Add manual shortlist flag and auto-match tracking to matches table

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manually_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manually_added_by UUID REFERENCES users(id) ON DELETE SET NULL;
