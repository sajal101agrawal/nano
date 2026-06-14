# Application Flows

Detailed walkthroughs of the major user flows in the platform.

---

## Candidate application flow

### Overview

The application flow is a client-side multi-step wizard (`src/app/jobs/[slug]/ApplicationFlow.tsx`) with six steps: `upload → details → preferences → questions → submitting → done`. It supports draft persistence so candidates can resume if they close the browser.

### Step 1: Upload (`/jobs/[slug]`)

1. Candidate navigates to a job posting
2. The `ApplicationFlow` component is rendered on the client
3. Candidate drags and drops (or clicks to browse) a PDF or DOCX file (max 10 MB)
4. On "Continue", the component calls `POST /api/candidate/draft` with the CV file and `requirementId`
5. The draft API:
   - Uploads the CV to S3/MinIO
   - Runs a quick Claude parse (without `tool_use`) to extract name, email, phone
   - Creates a `draft_applications` row with `step = upload`
   - Returns `{ draftId, parsed: { full_name, email, phone } }`
6. The draft ID is stored in component state and added to the URL: `?d=<draftId>&s=details`

### Step 2: Details

1. Extracted contact info is pre-filled in the form
2. Candidate verifies/corrects name, email, and optional phone number
3. Phone numbers are auto-formatted on blur (Indian and US formats detected)
4. On "Continue":
   - Component advances to `preferences` step
   - `PATCH /api/candidate/draft/[id]` saves the contact details and `step = preferences`
   - URL is updated: `?d=<draftId>&s=preferences`

### Step 3: Preferences

Collects work preferences:
- Open to: Full-time, Contract, Freelance (multi-select)
- Notice period: Immediate, 15, 30, 60, 90, 90+ days (single-select)
- Preferred locations: Remote, Bengaluru, Gurugram, Hyderabad, Mumbai, Pune, Chennai, Noida (multi-select)
- Current annual CTC (INR, in lakhs)
- Expected annual CTC (INR, in lakhs)
- Expected hourly rate (only shown when Contract or Freelance is selected)

On "Continue":
1. Draft progress is saved via `PATCH /api/candidate/draft/[id]`
2. Advances to the questions step (or submitting if no questions are configured)

### Step 4: Screening questions

If the requirement has custom screening questions (`requirement_questions`), the candidate answers them here. Question types: text, select, boolean, multiselect.

On "Submit Application":
1. Draft progress is saved
2. `POST /api/candidate/apply` is called with all form data as `multipart/form-data`, including JSON-encoded `answers`

### Step 5: Submission (`POST /api/candidate/apply`)

The API endpoint:

1. Validates rate limit: 10 submissions per IP per hour
2. Validates file type and size (if not using a draft CV)
3. Loads draft CV info from `draft_applications` if `draftId` is provided (avoids re-uploading)
4. Validates email format
5. Checks suppression list — rejects with 403 if suppressed
6. Validates requirement exists and is `open`
7. Runs a database transaction:
   - **Upsert candidate**: looks up by `primary_email` or `primary_phone`
     - If found: updates `last_active_at`, `availability_status = available`, fills null fields
     - If not found: creates new candidate row
   - Sets all prior profiles for this candidate to `is_current = FALSE`
   - Creates `candidate_profiles` row with `parse_status = pending`, `version = max + 1`
   - Creates `applications` row with `status = applied`
   - Inserts `application_answers` for each question response
   - Inserts `availability_events` row with `source = application, status = available`
8. After transaction:
   - Calls `enqueueCVParse()` to queue the background CV parse job
   - Marks draft as `completed` (fire-and-forget)
   - Creates admin notification (fire-and-forget)
   - Sends confirmation email to candidate (fire-and-forget)
9. Returns `{ success: true, applicationId }`

### Step 6: Done

Shows confirmation message with requirement title and a link to browse more positions.

### Draft resumption

If a candidate returns to the job page with a `?d=<draftId>` query parameter:

1. On mount, `GET /api/candidate/draft/[id]` is called
2. If the draft is valid and `status = draft`, pre-fills:
   - Parsed name, email, phone
   - Previously saved contact details
   - Saved preferences
3. Advances to the saved step (`details` or `preferences`)

---

## CV parse flow (background)

After the application is submitted, the CV parse job runs in the worker:

```
applications.status: applied → parsing → parsed (or parse_failed)
candidate_profiles.parse_status: pending → processing → completed (or failed / review_required)
```

See [AI & Matching: CV parsing pipeline](ai-matching.md#cv-parsing-pipeline) for detailed steps.

When parsing completes:
- The candidate's core fields are updated
- Skills are stored in `candidate_skills`
- An embedding is generated and stored
- A `match` job is enqueued for every open requirement the candidate has applied to

---

## Admin: creating a requirement

1. Admin navigates to `/admin/requirements/new`
2. Fills the `NewRequirementForm` with:
   - Title, raw JD text, client, engagement type, work mode, location, budget range
   - Custom screening questions (type: text, select, boolean, multiselect; with options and required flag)
3. On submit, `POST /api/admin/requirements` is called
4. The API:
   - Parses the JD with Claude (`extractJDRequirements`) to get structured fields
   - Generates a unique `public_slug` (title slugified + short UUID)
   - Creates the `requirements` row
   - Creates `requirement_questions` rows
   - Enqueues a `match` job to compute initial scores against the existing candidate pool
5. Admin is redirected to the requirement detail page

---

## Admin: reviewing candidates for a requirement

1. Admin opens `/admin/requirements/[id]`
2. Page shows two sections: **Matches** (pool-wide AI matches) and **Applicants** (candidates who applied)
3. For each candidate, the match score, vector score, rule score, and Claude rationale are shown
4. Admin can:
   - Change application status (shortlisted, contacted, in_discussion, offered, placed, rejected, withdrawn)
   - View full candidate profile (CV, parsed JSON, skills, work history)
   - Download the CV
   - Generate a client-ready redacted CV
   - Send an outreach email directly from the candidate detail page

---

## Admin: sending outreach email

1. From any candidate detail page, admin clicks "Send Email"
2. The `SendEmailModal` opens
3. Admin selects a template (from `templates` table), selects the target requirement (optional), and edits the body
4. Template variables are substituted automatically:
   - `{{candidate_name}}`, `{{requirement_title}}`, `{{engagement_type}}`, `{{location}}`, etc.
5. On send, `POST /api/admin/email/send` is called:
   - Creates an `outreach_messages` row with `status = queued`
   - Calls `enqueueEmail()` to queue the actual send
6. The `emailProcessor` worker:
   - Checks suppression list
   - Sends via Resend
   - Updates `outreach_messages` with `status = sent`, `esp_message_id`, `sent_at`
7. As Resend delivers the email, webhook events update the status: `delivered → opened → clicked`

---

## Availability check flow

### Admin-triggered check

1. Admin opens a candidate detail page and clicks "Send Availability Check"
2. `POST /api/admin/candidates/[id]/availability` is called
3. This calls `enqueueAvailabilityCheck({ type: "send_check", candidateId, requirementId })`
4. The `availabilityProcessor` worker:
   - Creates an `availability_events` row with a UUID token
   - Sets `expires_at` to `AVAILABILITY_TOKEN_EXPIRY_DAYS` days from now
   - Sends an email with two one-click links

### Automated bulk check (daily cron)

Daily at 9am UTC, the `bulk_check` cron job finds candidates who:
- Are `active` and have a `primary_email`
- Have `availability_status` of `available` or `unknown`
- Have not been active in the last `AVAILABILITY_CHECK_INTERVAL_DAYS` days
- Have not received an availability check in the last `AVAILABILITY_CHECK_INTERVAL_DAYS` days

Up to 50 candidates are checked per run, with a 500ms delay between emails.

### Candidate response

The availability email contains two links:
- `Yes, I'm available` → `/availability/confirm?token=<uuid>&s=available`
- `No, not available now` → `/availability/confirm?token=<uuid>&s=unavailable`

When a candidate clicks a link:
1. `/availability/confirm` page loads
2. Server-side: looks up the `availability_events` row by token
3. Validates: token exists, not used, not expired
4. Updates:
   - `availability_events.token_used = TRUE`, `status = <s>`, `responded_at = NOW()`
   - `candidates.availability_status = <s>`
   - Creates admin notification: "availability_changed"
5. Shows confirmation page to the candidate

### Token expiry (hourly cron)

Every hour, the `expire-availability-tokens` cron job:
- Finds tokens where `token_used = FALSE` and `expires_at < NOW()`
- Sets them to `token_used = TRUE`
- Resets the candidate's `availability_status` to `unknown` (only if currently `available`)

---

## Admin: prospect sourcing flow

1. Admin opens `/admin/prospects`
2. Searches Apollo.io via `POST /api/admin/prospects/search` with body `{ skills, title, location, seniority }`
3. Apollo results are saved to the `prospects` table and returned
4. Admin can:
   - **Enrich** a prospect: `POST /api/admin/prospects/[id]/enrich` → Apollo enrichment data + email lookup stored in `enrichment_json`
   - **Send outreach**: same email flow as for candidates
   - **Convert to candidate**: add them to the candidate pool manually

---

## Admin login flow

### Without 2FA

1. Admin submits email + password to `POST /api/admin/auth/login`
2. Server verifies password with Argon2
3. Creates a `nano_admin_session` JWT (7-day expiry) with `{ userId, email, name, role, totpVerified: true }`
4. Sets cookie, returns `{ success: true, requiresTwoFactor: false }`
5. Browser redirects to `/admin`

### With 2FA enabled

1. Same login — password verified
2. Server sees `totp_enabled = true` on the user
3. Returns `{ success: true, requiresTwoFactor: true }`
4. Browser renders the 2FA code entry page (`/admin/login/2fa`)
5. Admin submits their TOTP token to `POST /api/admin/auth/verify-2fa`
6. Server verifies with `speakeasy.totp.verify()`
7. Issues session cookie with `totpVerified: true`
8. Browser redirects to `/admin`

### 2FA setup flow

1. Admin opens `/admin/settings`
2. Clicks "Enable 2FA"
3. `POST /api/admin/settings/2fa/setup`:
   - Generates a TOTP secret with `speakeasy.generateSecret()`
   - Returns a QR code data URL (for authenticator app scanning) and the raw secret
4. Admin scans QR code with their authenticator app (Google Authenticator, Authy, etc.)
5. Admin enters the 6-digit TOTP token to confirm
6. `POST /api/admin/settings/2fa/enable`:
   - Verifies the TOTP token
   - Sets `totp_secret` and `totp_enabled = true` on the user record

---

## Email unsubscribe flow

Every outreach and availability email includes an unsubscribe link:
`/unsubscribe?email=<url-encoded-email>`

When a candidate visits this page:
1. Server reads the `email` query parameter
2. Inserts into `suppression_list` with `reason = unsubscribed`
3. Shows a confirmation page: "You have been unsubscribed"

Suppressed addresses are checked before every outreach/availability email send. Future emails to suppressed addresses are silently dropped.

---

## Draft abandonment reminder flow

The `draftReminderProcessor` runs on cron to re-engage candidates who started but did not complete an application.

**15-minute reminder** (check every 5 minutes):
- Finds drafts `created > 15 minutes ago`, `reminder_sent_15m = FALSE`
- Sends a "Come back and finish your application" email
- Sets `reminder_sent_15m = TRUE`

**6-hour reminder** (check every 30 minutes):
- Finds drafts `created > 6 hours ago`, `reminder_sent_6h = FALSE`
- Sends a second reminder email
- Sets `reminder_sent_6h = TRUE`

**Stale expiry** (daily at midnight):
- Finds drafts `created > 7 days ago`, `status = draft`
- Sets `status = expired`
- Expired drafts cannot be resumed

If a candidate completes their application, the draft is marked `status = completed` immediately and no further reminders are sent.
