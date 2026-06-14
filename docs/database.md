# Database Schema

Nano uses PostgreSQL 16 with three extensions:

- `vector` (pgvector) — 1536-dimension float vectors with HNSW ANN indexes
- `uuid-ossp` — `uuid_generate_v4()` for UUID primary keys
- `pg_trgm` — trigram GIN indexes for fuzzy text search on names and skills

All tables use UUID primary keys and have `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Tables that are mutable have `updated_at` managed by a shared `update_updated_at()` trigger.

---

## Tables

### `users`

Admin operator accounts.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | TEXT UNIQUE NOT NULL | |
| `name` | TEXT NOT NULL | |
| `role` | TEXT NOT NULL | `admin`, `recruiter`, or `viewer` |
| `password_hash` | TEXT | Argon2 or PBKDF2-SHA512 |
| `totp_secret` | TEXT | Encrypted TOTP secret (when 2FA is enabled) |
| `totp_enabled` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `email_verified` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `last_login_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | Auto-updated by trigger |

Indexes: `idx_users_email` on `email`.

---

### `clients`

Client companies that post hiring requirements.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `company_name` | TEXT NOT NULL | |
| `website` | TEXT | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

---

### `recruiters`

Individual contacts at client companies.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID NOT NULL | FK → `clients(id)` ON DELETE CASCADE |
| `contact_name` | TEXT NOT NULL | |
| `email` | TEXT NOT NULL | |
| `phone` | TEXT | |
| `role` | TEXT | Job title at the client |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes: `idx_recruiters_client`, `idx_recruiters_email`.

---

### `candidates`

Core candidate record. One row per person, identified by `primary_email` or `primary_phone`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `primary_email` | TEXT UNIQUE | Normalized (lowercase, trimmed) |
| `primary_phone` | TEXT UNIQUE | |
| `full_name` | TEXT | |
| `location` | TEXT | City/country string |
| `headline` | TEXT | Short recruiter-facing line |
| `source` | TEXT NOT NULL DEFAULT `inbound` | `inbound`, `sourced`, `referral` |
| `status` | TEXT NOT NULL DEFAULT `active` | `active`, `inactive`, `deleted` |
| `availability_status` | TEXT NOT NULL DEFAULT `unknown` | `available`, `unavailable`, `unknown` |
| `open_to_contract` | BOOLEAN | |
| `open_to_fulltime` | BOOLEAN | |
| `notice_period_days` | INTEGER | |
| `expected_rate` | TEXT | Free-form, e.g. "18 LPA" |
| `expected_rate_currency` | TEXT DEFAULT `USD` | |
| `work_mode` | TEXT | `remote`, `hybrid`, `onsite` |
| `current_title` | TEXT | |
| `current_company` | TEXT | |
| `total_experience_years` | NUMERIC(4,1) | |
| `last_active_at` | TIMESTAMPTZ | Updated on each application |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

Indexes:
- `idx_candidates_email` on `primary_email`
- `idx_candidates_phone` on `primary_phone`
- `idx_candidates_availability` on `availability_status`
- `idx_candidates_name_trgm` GIN on `full_name` (trigram — enables fuzzy name search)
- `idx_candidates_status` on `status`

---

### `candidate_profiles`

Versioned CV parse results. A candidate can have multiple profile versions (one per application). Only the most recent has `is_current = TRUE`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `candidate_id` | UUID NOT NULL | FK → `candidates(id)` ON DELETE CASCADE |
| `raw_cv_url` | TEXT | S3/R2 object URL |
| `raw_cv_filename` | TEXT | Original filename |
| `raw_cv_size_bytes` | INTEGER | |
| `parsed_json` | JSONB | Full structured output from Claude |
| `summary` | TEXT | AI-generated 3–4 sentence recruiter summary |
| `total_experience_years` | NUMERIC(4,1) | Extracted or calculated |
| `current_title` | TEXT | |
| `current_company` | TEXT | |
| `expected_rate` | TEXT | |
| `currency` | TEXT DEFAULT `USD` | |
| `notice_period_days` | INTEGER | |
| `open_to_contract` | BOOLEAN | |
| `open_to_fulltime` | BOOLEAN | |
| `work_mode` | TEXT | |
| `parse_status` | TEXT NOT NULL | `pending`, `processing`, `completed`, `failed`, `review_required` |
| `parse_error` | TEXT | Set when `parse_status = failed` |
| `embedding` | vector(1536) | OpenAI `text-embedding-3-small` |
| `version` | INTEGER NOT NULL DEFAULT 1 | Incremented per application |
| `is_current` | BOOLEAN NOT NULL DEFAULT TRUE | Only one `TRUE` per candidate |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes:
- `idx_profiles_candidate` on `candidate_id`
- `idx_profiles_current` partial on `(candidate_id, is_current) WHERE is_current = TRUE`
- `idx_profiles_parse_status` on `parse_status`
- `idx_profiles_embedding` HNSW on `embedding vector_cosine_ops` (m=16, ef_construction=64)

#### `parsed_json` structure

The `parsed_json` JSONB column stores the full Claude extraction output:

```json
{
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string",
  "github": "string",
  "portfolio": "string",
  "location": "string",
  "current_title": "string",
  "current_company": "string",
  "total_experience_years": 8.5,
  "headline": "string",
  "domain": "string",
  "seniority": "senior",
  "summary": "string",
  "roles": [
    {
      "title": "string",
      "company": "string",
      "location": "string",
      "start_date": "2020-01",
      "end_date": "2023-06",
      "is_current": false,
      "duration_months": 41,
      "summary": "string",
      "achievements": ["string"]
    }
  ],
  "education": [
    { "institution": "string", "degree": "string", "field": "string", "graduation_year": "2016" }
  ],
  "skills": [
    { "skill": "React", "years": 5, "proficiency": "expert", "category": "framework" }
  ],
  "projects": [...],
  "certifications": [...],
  "awards": [...],
  "publications": [...],
  "languages": [...],
  "volunteer": [...],
  "raw_text_confidence": 0.95
}
```

---

### `candidate_skills`

Denormalized, queryable skill records extracted from the candidate profile. Refreshed every time a CV is re-parsed.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `candidate_id` | UUID NOT NULL | FK → `candidates(id)` ON DELETE CASCADE |
| `skill` | TEXT NOT NULL | Canonical name (e.g. "JavaScript") |
| `skill_normalized` | TEXT NOT NULL | Lowercase, underscored (e.g. "javascript") |
| `years` | NUMERIC(4,1) | |
| `proficiency` | TEXT | `beginner`, `intermediate`, `advanced`, `expert` |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes:
- `idx_skills_candidate` on `candidate_id`
- `idx_skills_normalized` on `skill_normalized`
- `idx_skills_skill_trgm` GIN on `skill` (trigram — fuzzy skill search)

---

### `requirements`

Job requirements / open positions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID | FK → `clients(id)` ON DELETE SET NULL |
| `title` | TEXT NOT NULL | |
| `jd_raw` | TEXT NOT NULL | Original job description text |
| `parsed_requirements_json` | JSONB | Claude-extracted structured requirements |
| `required_skills` | TEXT[] | Denormalized from parsed JSON |
| `min_experience` | NUMERIC(4,1) | |
| `location` | TEXT | |
| `work_mode` | TEXT | `remote`, `onsite`, `hybrid`, `flexible` |
| `engagement_type` | TEXT NOT NULL DEFAULT `contract` | `contract`, `fulltime`, `both` |
| `budget_min` | NUMERIC(12,2) | |
| `budget_max` | NUMERIC(12,2) | |
| `budget_currency` | TEXT DEFAULT `USD` | |
| `budget_period` | TEXT DEFAULT `monthly` | `hourly`, `daily`, `monthly`, `annual` |
| `status` | TEXT NOT NULL DEFAULT `open` | `open`, `on_hold`, `filled`, `closed` |
| `public_slug` | TEXT UNIQUE NOT NULL | URL slug for the public job page |
| `embedding` | vector(1536) | Generated from `jd_raw` |
| `created_by` | UUID | FK → `users(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

Indexes:
- `idx_requirements_status` on `status`
- `idx_requirements_slug` on `public_slug`
- `idx_requirements_client` on `client_id`
- `idx_requirements_embedding` HNSW on `embedding vector_cosine_ops`

#### `parsed_requirements_json` structure

```json
{
  "required_skills": ["React", "TypeScript", "Node.js"],
  "nice_to_have_skills": ["GraphQL", "Docker"],
  "min_experience_years": 4,
  "max_experience_years": 8,
  "engagement_type": "contract",
  "location": "Bengaluru",
  "work_mode": "hybrid",
  "budget_range": "50-80 LPA",
  "key_responsibilities": ["string"],
  "qualifications": ["string"]
}
```

---

### `requirement_questions`

Custom screening questions attached to a requirement. Candidates answer these during the application flow.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `requirement_id` | UUID NOT NULL | FK → `requirements(id)` ON DELETE CASCADE |
| `question_text` | TEXT NOT NULL | |
| `question_type` | TEXT NOT NULL DEFAULT `select` | `text`, `select`, `boolean`, `multiselect` |
| `options` | JSONB | Array of `{ value, label }` for select/multiselect types |
| `required` | BOOLEAN NOT NULL DEFAULT TRUE | |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes: `idx_questions_requirement` on `(requirement_id, sort_order)`.

---

### `applications`

A candidate's application to a specific requirement. Tracks the full lifecycle from submission to placement.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `requirement_id` | UUID NOT NULL | FK → `requirements(id)` ON DELETE CASCADE |
| `candidate_id` | UUID NOT NULL | FK → `candidates(id)` ON DELETE CASCADE |
| `profile_id` | UUID | FK → `candidate_profiles(id)` ON DELETE SET NULL |
| `status` | TEXT NOT NULL DEFAULT `applied` | See status lifecycle below |
| `match_score` | NUMERIC(5,2) | Final score 0–100 |
| `vector_score` | NUMERIC(5,4) | Raw cosine similarity 0–1 |
| `rule_score` | NUMERIC(5,4) | Rule adjustment factor 0–1 |
| `match_rationale` | TEXT | Claude explanation |
| `applied_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

Unique constraint on `(requirement_id, candidate_id)` — one application per candidate per requirement.

**Application status lifecycle:**

```
applied → parsing → parsed → shortlisted → contacted → in_discussion → offered → placed
                 ↘ parse_failed
                                           ↘ rejected
                                           ↘ withdrawn
```

Indexes:
- `idx_applications_requirement` on `requirement_id`
- `idx_applications_candidate` on `candidate_id`
- `idx_applications_status` on `status`
- `idx_applications_score` on `match_score DESC NULLS LAST`

---

### `application_answers`

Stores candidate answers to requirement-specific screening questions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `application_id` | UUID NOT NULL | FK → `applications(id)` ON DELETE CASCADE |
| `question_id` | UUID NOT NULL | FK → `requirement_questions(id)` ON DELETE CASCADE |
| `answer_value` | JSONB | Supports string, boolean, and string arrays |
| `created_at` | TIMESTAMPTZ NOT NULL | |

---

### `app_settings`

Agency branding key-value store used for client-ready CV generation.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | Setting name |
| `value` | TEXT NOT NULL | Setting value |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

Default keys (seeded by migration 004): `agency_name`, `agency_tagline`, `agency_email`, `agency_phone`, `agency_website`, `agency_address`.

---

### `draft_applications`

Partial applications where the candidate uploaded a CV but did not complete submission. Used to enable resumable applications and abandonment reminders.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `requirement_id` | UUID NOT NULL | FK → `requirements(id)` ON DELETE CASCADE |
| `cv_url` | TEXT NOT NULL | S3 URL |
| `cv_key` | TEXT NOT NULL | S3 key |
| `cv_filename` | TEXT | |
| `cv_size_bytes` | INTEGER | |
| `cv_mime_type` | TEXT | |
| `parsed_name` | TEXT | Quick-parsed name from draft parse |
| `parsed_email` | TEXT | Quick-parsed email |
| `parsed_phone` | TEXT | Quick-parsed phone |
| `candidate_name` | TEXT | User-entered, saved on details step |
| `candidate_email` | TEXT | User-entered |
| `candidate_phone` | TEXT | User-entered |
| `preferences` | JSONB | Saved work preferences |
| `step` | TEXT NOT NULL DEFAULT `upload` | Current step: `upload`, `details`, `preferences`, `questions` |
| `status` | TEXT NOT NULL DEFAULT `draft` | `draft`, `completed`, `expired` |
| `reminder_sent_15m` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `reminder_sent_6h` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `ip_address` | TEXT | |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |
| `completed_at` | TIMESTAMPTZ | Set when `status = completed` |

---

### `availability_events`

Log of every availability check sent and every response received (including one-click email responses).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `candidate_id` | UUID NOT NULL | FK → `candidates(id)` ON DELETE CASCADE |
| `status` | TEXT NOT NULL | `available`, `unavailable`, `unknown` |
| `source` | TEXT NOT NULL DEFAULT `system` | `application`, `email_click`, `admin`, `system`, `expiry` |
| `token` | TEXT UNIQUE | One-time use UUID in availability email links |
| `token_used` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `requirement_id` | UUID | FK → `requirements(id)` ON DELETE SET NULL |
| `requested_at` | TIMESTAMPTZ NOT NULL | |
| `responded_at` | TIMESTAMPTZ | Set when candidate clicks the link |
| `expires_at` | TIMESTAMPTZ | After expiry, `token_used` is set TRUE by cron |
| `notes` | TEXT | |

Indexes:
- `idx_availability_candidate` on `candidate_id`
- `idx_availability_token` partial on `token WHERE token IS NOT NULL`
- `idx_availability_expires` partial on `expires_at WHERE token_used = FALSE`

---

### `matches`

Pre-computed AI match scores between requirements and candidates from the entire pool (not just applicants).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `requirement_id` | UUID NOT NULL | FK → `requirements(id)` ON DELETE CASCADE |
| `candidate_id` | UUID NOT NULL | FK → `candidates(id)` ON DELETE CASCADE |
| `score` | NUMERIC(5,2) | Final score 0–100 |
| `vector_score` | NUMERIC(5,4) | Raw cosine similarity 0–1 |
| `rule_score` | NUMERIC(5,4) | Rule adjustment factor 0–1 |
| `rationale` | TEXT | Claude explanation or fallback text |
| `is_manual` | BOOLEAN NOT NULL DEFAULT FALSE | True when recruiter manually added to shortlist |
| `manually_added_at` | TIMESTAMPTZ | When manually shortlisted |
| `manually_added_by` | UUID | FK → `users(id)` — admin who added |
| `generated_at` | TIMESTAMPTZ NOT NULL | |

Unique constraint on `(requirement_id, candidate_id)` — upserted on each match run.

Indexes:
- `idx_matches_requirement` on `(requirement_id, score DESC NULLS LAST)`
- `idx_matches_candidate` on `candidate_id`

---

### `prospects`

External candidates sourced via Apollo.io or other providers. Not yet in the candidate pool.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `provider` | TEXT NOT NULL DEFAULT `apollo` | Source provider |
| `provider_profile_id` | TEXT | Provider's internal ID (dedup) |
| `full_name` | TEXT | |
| `headline` | TEXT | |
| `current_company` | TEXT | |
| `location` | TEXT | |
| `public_profile_url` | TEXT | LinkedIn or provider URL |
| `summary` | TEXT | AI-generated summary |
| `enrichment_json` | JSONB | Raw enrichment data from provider |
| `email` | TEXT | |
| `email_status` | TEXT | `found`, `not_found`, `unverifiable`, `bounced` |
| `provenance_json` | JSONB | How/why they were sourced |
| `sourced_for_requirement_id` | UUID | FK → `requirements(id)` ON DELETE SET NULL |
| `converted_to_candidate_id` | UUID | FK → `candidates(id)` ON DELETE SET NULL |
| `do_not_contact` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

Indexes:
- `idx_prospects_email` partial on `email WHERE email IS NOT NULL`
- `idx_prospects_requirement` on `sourced_for_requirement_id`
- `idx_prospects_provider` on `(provider, provider_profile_id)`

---

### `templates`

Reusable email templates with variable substitution.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | |
| `template_type` | TEXT NOT NULL | `candidate_outreach`, `shortlist_intro`, `availability_check`, `recruiter_profile_share`, `otp`, `confirmation`, `general` |
| `subject` | TEXT NOT NULL | May contain `{{variable}}` placeholders |
| `body` | TEXT NOT NULL | HTML with `{{variable}}` placeholders |
| `variables` | TEXT[] | List of expected variable names |
| `is_system` | BOOLEAN NOT NULL DEFAULT FALSE | System templates cannot be deleted |
| `created_by` | UUID | FK → `users(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL | |

Template rendering uses `{{variable_name}}` syntax. Conditional blocks `{{#if variable}}...{{/if}}` are supported (blocks with falsy variables are removed).

Default system templates (seeded by migration 002):
- Application Confirmation
- Availability Check
- Candidate Outreach
- Recruiter Profile Share
- Prospect Outreach

---

### `outreach_messages`

Log of every email sent via the platform (outreach, availability, transactional).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `target_type` | TEXT NOT NULL | `candidate`, `prospect`, `recruiter` |
| `target_id` | UUID NOT NULL | ID in the respective table |
| `requirement_id` | UUID | FK → `requirements(id)` ON DELETE SET NULL |
| `template_id` | UUID | FK → `templates(id)` ON DELETE SET NULL |
| `sent_by` | UUID | FK → `users(id)` ON DELETE SET NULL |
| `subject` | TEXT NOT NULL | Final rendered subject |
| `body` | TEXT NOT NULL | Final rendered HTML body |
| `email_to` | TEXT NOT NULL | Recipient email |
| `stream` | TEXT NOT NULL DEFAULT `outreach` | `transactional`, `availability`, `outreach` |
| `status` | TEXT NOT NULL DEFAULT `queued` | `queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed`, `replied` |
| `esp_message_id` | TEXT | Resend message ID |
| `thread_id` | TEXT | For threading replies |
| `sent_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes:
- `idx_messages_target` on `(target_type, target_id)`
- `idx_messages_requirement` on `requirement_id`
- `idx_messages_esp_id` on `esp_message_id`
- `idx_messages_thread` on `thread_id`
- `idx_messages_status` on `status`

---

### `email_events`

Webhook events from Resend for email delivery tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `message_id` | UUID NOT NULL | FK → `outreach_messages(id)` ON DELETE CASCADE |
| `event_type` | TEXT NOT NULL | `sent`, `delivered`, `opened`, `clicked`, `bounced`, `complained`, `replied`, `unsubscribed` |
| `occurred_at` | TIMESTAMPTZ NOT NULL | |
| `metadata` | JSONB | Raw event payload |

---

### `suppression_list`

Email addresses that must not receive outreach or availability emails.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | TEXT NOT NULL UNIQUE | Lowercase |
| `reason` | TEXT NOT NULL | `unsubscribed`, `bounced`, `complained`, `manual`, `gdpr_erasure` |
| `added_at` | TIMESTAMPTZ NOT NULL | |

---

### `otp_tokens`

One-time passwords for candidate email/phone authentication.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `identifier` | TEXT NOT NULL | Email or phone |
| `identifier_type` | TEXT NOT NULL | `email` or `phone` |
| `code` | TEXT NOT NULL | 6-digit numeric OTP |
| `used` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `ip_address` | TEXT | |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `expires_at` | TIMESTAMPTZ NOT NULL | `OTP_EXPIRY_MINUTES` from creation |

Index: `idx_otp_identifier` on `(identifier, used, expires_at)`.

---

### `audit_log`

Immutable log of admin actions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID | FK → `users(id)` ON DELETE SET NULL |
| `action` | TEXT NOT NULL | e.g. `candidate.status_updated`, `requirement.created` |
| `entity_type` | TEXT | e.g. `candidate`, `requirement` |
| `entity_id` | UUID | |
| `metadata` | JSONB | Additional context |
| `ip_address` | TEXT | |
| `user_agent` | TEXT | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

---

### `notifications`

In-app notifications for admin users.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID | FK → `users(id)` ON DELETE CASCADE |
| `type` | TEXT NOT NULL | `new_application`, `parse_failed`, `availability_changed`, `email_reply`, `system` |
| `title` | TEXT NOT NULL | |
| `body` | TEXT | |
| `entity_type` | TEXT | |
| `entity_id` | UUID | |
| `read` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

---

## Updated_at trigger

A shared PostgreSQL function and set of triggers keep `updated_at` columns current automatically:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to: `users`, `clients`, `candidates`, `requirements`, `applications`, `prospects`, `templates`.

---

## HNSW index parameters

Both vector columns use the same HNSW parameters:

```sql
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
```

- `m = 16` — number of bidirectional links per node; higher = better recall, more memory
- `ef_construction = 64` — build-time search width; higher = better quality index, slower build

At query time, `ef_search` can be set per session: `SET hnsw.ef_search = 100;` to trade off speed vs recall.

---

## Entity relationship summary

```
clients ────────────── recruiters
   │
   └── requirements ──── requirement_questions
            │                    │
            │              application_answers
            │                    │
   candidates ────────────── applications ──── candidate_profiles
       │                                               │
       ├── candidate_skills                      (embedding vector)
       ├── availability_events
       └── matches ◄──────── requirements

   prospects ────────── requirements (sourced_for)
            │
            └──────── candidates (converted_to)

   users ──── outreach_messages ──── email_events
         ├─── templates
         ├─── notifications
         └─── audit_log

   suppression_list
   otp_tokens
   draft_applications
   app_settings
```
