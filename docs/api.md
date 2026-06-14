# API Reference

All API routes are under `/api/`. Routes under `/api/admin/` require a valid `nano_admin_session` JWT cookie (set after login). Routes under `/api/candidate/` are public (rate-limited).

Response format is JSON. Admin routes typically use: `{ success: boolean, data?: T, error?: string }`. Some routes return data directly without the wrapper.

---

## Health

### GET `/api/health`

Public health check. Used by Railway deployment healthcheck.

**Response:** `{ status: "ok" | "degraded", checks: { database: "ok" | "error" } }`

Returns HTTP 503 when database is unreachable.

---

## Admin authentication

### POST `/api/admin/auth/login`

Authenticate an admin user with email and password.

**Request body (JSON):**
```json
{
  "email": "admin@example.com",
  "password": "yourpassword"
}
```

**Responses:**

| Status | Body | Description |
|---|---|---|
| 200 | `{ success: true, requiresTwoFactor: false, user: {...} }` | Login successful, no 2FA |
| 200 | `{ success: true, requiresTwoFactor: true }` | Login successful, 2FA required — redirect to 2FA page |
| 401 | `{ success: false, error: "Invalid credentials" }` | Wrong email or password |

Sets `nano_admin_session` cookie on success (or after 2FA verification if 2FA is enabled).

---

### POST `/api/admin/auth/verify-2fa`

Verify a TOTP code to complete login when 2FA is enabled.

**Request body (JSON):**
```json
{ "token": "123456" }
```

**Responses:**

| Status | Body |
|---|---|
| 200 | `{ success: true }` |
| 401 | `{ success: false, error: "Invalid or expired code" }` |

---

### POST `/api/admin/auth/logout`

Destroy the admin session cookie.

**Responses:** `200 { success: true }`

---

## Admin — Candidates

### GET `/api/admin/candidates`

List candidates with pagination and filters.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `q` | string | Full-text / trigram name search |
| `status` | string | Filter by `status` |
| `availability` | string | Filter by `availability_status` |
| `source` | string | Filter by `source` |

**Response:** `{ success: true, data: Candidate[], total, page, limit, totalPages }`

---

### GET `/api/admin/candidates/[id]`

Get a single candidate with their current profile, skills, recent applications, and outreach history.

**Response:**
```json
{
  "success": true,
  "data": {
    "candidate": { ...Candidate },
    "profile": { ...CandidateProfile with parsed_json },
    "skills": [ ...CandidateSkill[] ],
    "applications": [ ...Application[] ],
    "messages": [ ...OutreachMessage[] ]
  }
}
```

---

### PATCH `/api/admin/candidates/[id]`

Update candidate fields.

**Request body (JSON):** Any subset of writable `Candidate` fields:
```json
{
  "status": "inactive",
  "availability_status": "unavailable",
  "full_name": "John Doe",
  "location": "Bengaluru, India"
}
```

---

### DELETE `/api/admin/candidates/[id]`

Soft-delete a candidate (sets `status = deleted`).

---

### POST `/api/admin/candidates/[id]/cv-reparse`

Re-queue a CV parse job for the candidate's current profile.

**Response:** `{ success: true, jobId: string }`

---

### GET `/api/admin/candidates/[id]/cv-url`

Get a presigned S3 download URL for the candidate's CV.

**Response:** `{ success: true, url: string }` (URL expires in 1 hour)

---

### GET `/api/admin/candidates/[id]/cv-preview`

Stream the CV file directly for inline preview.

---

### GET `/api/admin/candidates/[id]/client-cv`

Generate a redacted client-ready CV PDF (removes personal contact details).

---

### POST `/api/admin/candidates/[id]/availability`

Manually trigger an availability check email to the candidate.

**Request body (JSON):**
```json
{ "requirementId": "uuid" }
```

---

## Admin — Requirements

### GET `/api/admin/requirements`

List all requirements.

**Query parameters:** `page`, `limit`, `status`, `q` (title search)

**Response:** `{ success: true, data: Requirement[], total, ... }`

---

### POST `/api/admin/requirements`

Create a new requirement. Claude automatically parses the JD and generates an embedding.

**Request body (JSON):**
```json
{
  "title": "Senior React Developer",
  "jdRaw": "We are looking for...",
  "clientId": "uuid",
  "engagementType": "contract",
  "workMode": "remote",
  "location": "Bengaluru",
  "budgetMin": 50,
  "budgetMax": 80,
  "budgetCurrency": "INR",
  "budgetPeriod": "annual",
  "questions": [
    {
      "questionText": "How many years of React experience?",
      "questionType": "select",
      "options": [
        { "value": "1-2", "label": "1–2 years" },
        { "value": "3-5", "label": "3–5 years" }
      ],
      "required": true,
      "sortOrder": 0
    }
  ]
}
```

**Response:** `{ success: true, data: { requirement: Requirement } }`

---

### GET `/api/admin/requirements/[id]`

Get a requirement with its questions, match list, and applicant list.

---

### PATCH `/api/admin/requirements/[id]`

Update a requirement (title, status, budget, etc.).

---

### DELETE `/api/admin/requirements/[id]`

Delete a requirement (and cascade to applications, questions, matches).

---

### POST `/api/admin/requirements/[id]/match`

Trigger AI matching for the requirement. Enqueues a `match` job.

**Response:** `{ success: true, jobId: string }`

---

## Admin — Applications

### GET `/api/admin/applications/[id]`

Get a specific application with candidate and profile data.

---

### PATCH `/api/admin/applications/[id]`

Update application status or match score.

**Request body (JSON):**
```json
{
  "status": "shortlisted",
  "matchScore": 87.5,
  "matchRationale": "Strong React background..."
}
```

---

## Admin — Clients

### GET `/api/admin/clients`

List all clients.

### POST `/api/admin/clients`

Create a new client.

**Request body (JSON):**
```json
{
  "companyName": "Acme Corp",
  "website": "https://acme.com",
  "notes": "Series B startup",
  "recruiters": [
    { "contactName": "Jane Smith", "email": "jane@acme.com", "role": "CTO" }
  ]
}
```

---

## Admin — Prospects

### POST `/api/admin/prospects/search`

Search Apollo.io for candidates matching a query. Results are upserted into the `prospects` table.

**Request body (JSON):**
```json
{
  "skills": "React TypeScript",
  "title": "Senior Frontend Developer",
  "location": "Bengaluru",
  "seniority": "senior"
}
```

**Response:** `{ prospects: Prospect[] }`

Returns an empty array if `APOLLO_API_KEY` is not configured.

---

### POST `/api/admin/prospects/[id]/enrich`

Enrich a prospect's profile and find their email via Apollo.io.

**Response:** `{ success: true, data: Prospect }`

---

## Admin — Email

### POST `/api/admin/email/send`

Send an email to a candidate, prospect, or recruiter.

**Request body (JSON):**
```json
{
  "targetType": "candidate",
  "targetId": "uuid",
  "templateId": "uuid",
  "requirementId": "uuid",
  "variables": {
    "candidate_name": "John",
    "requirement_title": "Senior React Dev"
  },
  "customSubject": "Optional override subject",
  "customBody": "Optional override body HTML"
}
```

**Response:** `{ success: true, messageId: string }`

---

### POST `/api/admin/email/webhook`

Resend webhook endpoint. Receives delivery events and updates `outreach_messages.status` and inserts into `email_events`.

This endpoint is excluded from admin auth middleware and is public.

**Expected body:** Resend webhook payload with `type` and `data` fields.

---

## Health

### GET `/api/health`

Public health check (used by Railway). Verifies database connectivity.

**Response:**
```json
{
  "status": "ok",
  "checks": { "database": "ok" }
}
```

Returns HTTP 503 with `"status": "degraded"` if the database check fails.

---

## Admin — Shortlist

### POST `/api/admin/shortlist`

Manually add a candidate to the shortlist for a requirement. Upserts into the `matches` table with `is_manual = true`.

**Request body (JSON):**
```json
{
  "requirementId": "uuid",
  "candidateId": "uuid"
}
```

**Response:** `{ success: true, data: { added: true } }`

---

### DELETE `/api/admin/shortlist`

Remove a candidate from the shortlist.

**Request body (JSON):**
```json
{
  "requirementId": "uuid",
  "candidateId": "uuid"
}
```

**Response:** `{ success: true, data: { removed: true } }`

---

## Admin — Notifications

### GET `/api/admin/notifications`

Get all notifications for the current user.

**Query parameters:** `unreadOnly=true`

**Response:** `{ success: true, data: Notification[], unreadCount: number }`

---

### PATCH `/api/admin/notifications/[id]`

Mark a notification as read.

**Request body (JSON):** `{ "read": true }`

---

## Admin — Analytics

### GET `/api/admin/analytics`

Dashboard metrics.

**Response:**
```json
{
  "poolStats": { "total": "450", "active": "390", "last30d": "28" },
  "availabilityBreakdown": [{ "availability_status": "available", "count": "120" }],
  "applicationFunnel": [{ "status": "applied", "count": "40" }],
  "requirementsByStatus": [{ "status": "open", "count": "8" }],
  "emailStats": [{ "status": "delivered", "count": "200" }],
  "weeklyGrowth": [{ "week": "2026-06-09T00:00:00.000Z", "count": "12" }],
  "topSkills": [{ "skill": "React", "count": "85" }]
}
```

---

## Admin — Audit log

### GET `/api/admin/audit-log`

Paginated audit log.

**Query parameters:** `page`, `limit`, `userId`, `entityType`, `action`

---

## Admin — Settings

### GET/PATCH `/api/admin/settings/profile`

Get or update the current admin user's name and email.

---

### GET/PATCH `/api/admin/settings/agency`

Get or update agency branding settings (name, website, logo, etc.).

---

### POST `/api/admin/settings/2fa/setup`

Initiate TOTP 2FA setup — returns a QR code data URL and secret.

**Response:** `{ success: true, qrCode: string, secret: string }`

---

### POST `/api/admin/settings/2fa/enable`

Confirm and enable TOTP 2FA by verifying the current token.

**Request body (JSON):** `{ "token": "123456" }`

---

## Candidate — Authentication

### POST `/api/candidate/auth/request-otp`

Request an OTP for candidate authentication.

**Request body (JSON):**
```json
{
  "identifier": "candidate@example.com",
  "identifierType": "email"
}
```

Rate limited: 5 OTP requests per identifier per hour.

**Response:** `{ success: true }`

---

### POST `/api/candidate/auth/verify-otp`

Verify OTP and establish candidate session.

**Request body (JSON):**
```json
{
  "identifier": "candidate@example.com",
  "identifierType": "email",
  "code": "839201"
}
```

**Response:** `{ success: true, candidateId: string | null }`

Sets `nano_candidate_session` cookie.

---

## Candidate — Application

### POST `/api/candidate/draft`

Create a draft application: upload the CV, trigger a quick AI parse, and save the partial state.

**Request body:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `cvFile` | File | PDF or DOCX, max 10 MB |
| `requirementId` | string | UUID |

**Response:**
```json
{
  "success": true,
  "draftId": "uuid",
  "parsed": {
    "full_name": "John Doe",
    "email": "john@example.com",
    "phone": "+91 98765 43210"
  }
}
```

---

### GET `/api/candidate/draft/[id]`

Resume a draft application — returns saved state.

**Response:**
```json
{
  "success": true,
  "draft": {
    "cvFilename": "resume.pdf",
    "parsedName": "John Doe",
    "parsedEmail": "john@example.com",
    "candidateName": "John Doe",
    "preferences": { "openTo": ["contract"], ... },
    "step": "preferences"
  }
}
```

---

### PATCH `/api/candidate/draft/[id]`

Save progress on a draft.

**Request body (JSON):**
```json
{
  "candidateName": "John Doe",
  "candidateEmail": "john@example.com",
  "preferences": { ... },
  "step": "preferences"
}
```

---

### POST `/api/candidate/apply`

Submit a completed application.

**Request body:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `cvFile` | File | Required if no `draftId` |
| `draftId` | string | Optional — use CV from saved draft |
| `requirementId` | string | UUID |
| `candidateName` | string | Full name |
| `candidateEmail` | string | Email address |
| `candidatePhone` | string | Optional phone |
| `preferences` | string | JSON-encoded preferences object |
| `answers` | string | JSON-encoded `{ [questionId]: value }` |

Rate limited: 10 applications per IP per hour.

**Responses:**

| Status | Body | Description |
|---|---|---|
| 200 | `{ success: true, applicationId: uuid }` | Application submitted |
| 400 | `{ success: false, error: string }` | Validation error |
| 403 | `{ success: false, error: "This email has been unsubscribed" }` | Suppressed email |
| 404 | `{ success: false, error: "This position is no longer accepting applications" }` | Closed requirement |
| 409 | `{ success: false, error: "You have already applied for this position" }` | Duplicate |
| 429 | `{ success: false, error: "Too many submissions..." }` | Rate limited |

---

### POST `/api/candidate/parse-cv`

Quick CV parse for inline contact detail extraction during the application flow (used before draft creation in some flows).

**Request body:** `multipart/form-data` with `cvFile`

**Response:**
```json
{
  "success": true,
  "parsed": { "full_name": "...", "email": "...", "phone": "..." }
}
```

---

## Public pages (not API routes)

These are Next.js server-rendered pages that fetch data server-side:

| Route | Description |
|---|---|
| `GET /jobs` | Lists all open requirements |
| `GET /jobs/[slug]` | Single requirement detail + application flow |
| `GET /availability/confirm?token=<t>&s=available|unavailable` | One-click availability confirmation |
| `GET /unsubscribe?email=<e>` | Unsubscribe from outreach emails |

---

## Error handling

All API routes return structured errors:

```json
{ "success": false, "error": "Human-readable error message" }
```

HTTP status codes follow standard conventions:
- `400` — validation error or malformed request
- `401` — not authenticated
- `403` — authenticated but not authorized (or suppressed email)
- `404` — resource not found
- `409` — conflict (e.g. duplicate application)
- `429` — rate limited
- `500` — internal server error

---

## Rate limiting

Redis-backed sliding window rate limits:

| Endpoint | Limit |
|---|---|
| `POST /api/candidate/apply` | 10 per IP per hour |
| `POST /api/candidate/auth/request-otp` | 5 per identifier per hour (configurable via `OTP_RATE_LIMIT_PER_HOUR`) |
