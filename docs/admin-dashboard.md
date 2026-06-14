# Admin Dashboard

The admin dashboard is a protected Next.js App Router section under `/admin`. All routes require a valid `nano_admin_session` JWT cookie unless noted.

---

## Navigation

The sidebar provides access to all admin sections:

| Section | Route | Icon purpose |
|---|---|---|
| Dashboard | `/admin` | Overview stats and recent activity |
| Candidates | `/admin/candidates` | Talent pool management |
| Requirements | `/admin/requirements` | Job postings and matching |
| Drafts | `/admin/drafts` | Incomplete applications |
| Email | `/admin/email` | Outreach history and templates |
| Prospects | `/admin/prospects` | External sourcing via Apollo |
| Analytics | `/admin/analytics` | Metrics and charts |
| Notifications | `/admin/notifications` | In-app notification inbox |
| Settings | `/admin/settings` | Profile, agency, 2FA |

---

## Dashboard (`/admin`)

The home page shows:

- **Stat cards:** Total candidates, open roles, available candidates, applications this week
- **Recent applications:** Last 8 applications with candidate name, requirement title, status, and relative time
- **Parse failures:** Candidates with `parse_status` of `failed` or `review_required`
- **Quick actions:** Links to create requirement, view candidates

Data is fetched server-side on page load.

---

## Candidates (`/admin/candidates`)

### List view

- Paginated table of all active candidates
- **Filters:** Search query (`q`), status, availability, source
- Columns: name, headline, availability, source, last active, actions

### Detail view (`/admin/candidates/[id]`)

Shows complete candidate profile:

| Section | Content |
|---|---|
| Header | Name, headline, availability badge, current title/company |
| Actions | Send email, availability check, re-parse CV, edit, delete |
| Profile | AI summary, parsed work history, education, skills |
| CV viewer | Inline PDF/DOCX preview with download button |
| Applications | All applications with requirement title and status |
| Outreach | Email history with delivery status |

**Client-ready CV:** Generates a redacted PDF (`GET /api/admin/candidates/[id]/client-cv`) with agency branding from `app_settings`. Personal contact details are removed.

**Send Email modal:** Select template, optional requirement context, preview with variable substitution, send via queue.

---

## Requirements (`/admin/requirements`)

### List view

- All requirements with status, client, engagement type, applicant count
- Filter by status and search by title
- Link to create new requirement

### Create (`/admin/requirements/new`)

Form fields:
- Title, raw job description text
- Client selection (optional)
- Engagement type: contract, fulltime, both
- Work mode: remote, onsite, hybrid, flexible
- Location, budget range (min/max, currency, period)
- Custom screening questions (add/remove, reorder)

On submit: Claude parses JD, embedding generated, match job enqueued.

### Detail (`/admin/requirements/[id]`)

Three tabs:

**Shortlist tab**
- AI-matched candidates from `matches` table
- Score, vector score, rule score, Claude rationale per candidate
- Manual add/remove from shortlist
- Link to candidate detail

**Applications tab**
- Candidates who applied directly
- Application status dropdown (full pipeline)
- Add to shortlist action
- Match scores when available

**Details tab**
- Requirement metadata, parsed JD fields, budget, questions
- Edit and delete actions
- Trigger re-match button

---

## Drafts (`/admin/drafts`)

Monitors incomplete applications:

- Candidate email (from quick parse or entered details)
- Requirement title
- Current step (upload, details, preferences)
- Created time, reminder status (15m / 6h sent)
- Draft status: draft, completed, expired

Useful for identifying drop-off points and following up manually.

---

## Email centre (`/admin/email`)

- **Message history:** All sent emails with recipient, subject, stream, status, sent time
- **Status tracking:** queued → sent → delivered → opened → clicked (via Resend webhook)
- **Template list:** System and custom templates with type and variables

Outreach is initiated from candidate detail (`SendEmailModal`), not a separate compose page.

---

## Prospects (`/admin/prospects`)

External candidate sourcing via Apollo.io:

**Search form:**
- Skills / keywords
- Job title
- Location
- Seniority level

**Results table:**
- Name, headline, company, location, LinkedIn URL
- Email status (before/after enrich)
- Actions: Enrich (reveal email), Send outreach

**Enrich:** Synchronous Apollo People Match call. Updates prospect row with email if found.

Requires `APOLLO_API_KEY` configured.

---

## Analytics (`/admin/analytics`)

Visual dashboard with:

| Metric | Description |
|---|---|
| Pool stats | Total, active, and new candidates (30 days) |
| Availability breakdown | Pie/bar of available / unavailable / unknown |
| Application funnel | Count by application status |
| Requirements by status | Open, on hold, filled, closed |
| Email stats | Outreach message counts by delivery status |
| Weekly growth | Candidate additions over 12 weeks (chart) |
| Top skills | 15 most common skills in the pool |

Data from `GET /api/admin/analytics`.

---

## Notifications (`/admin/notifications`)

In-app notification inbox:

| Type | Trigger |
|---|---|
| `new_application` | Candidate submits application |
| `parse_failed` | CV parse fails after retries |
| `availability_changed` | Candidate responds to availability check |
| `email_reply` | Reply received (when configured) |
| `system` | General system events |

- Unread count badge in sidebar
- Mark individual notifications as read
- Links to relevant entity (candidate, requirement)

---

## Settings (`/admin/settings`)

### Profile

- Update admin name and email
- View role

### Agency branding

Key-value settings stored in `app_settings`:

| Key | Purpose |
|---|---|
| `agency_name` | Shown on client-ready CV |
| `agency_tagline` | Subtitle on exported CV |
| `agency_email` | Contact email on exported CV |
| `agency_phone` | Contact phone |
| `agency_website` | Website URL |
| `agency_address` | Physical address |

### Two-factor authentication

1. Click "Enable 2FA"
2. Scan QR code with authenticator app
3. Enter 6-digit TOTP to confirm
4. Future logins require TOTP after password

Disable by contacting an admin or direct database update (no disable UI currently).

---

## Authentication pages

| Route | Purpose |
|---|---|
| `/admin/login` | Email + password form |
| `/admin/login/2fa` | TOTP code entry (when 2FA enabled) |

Unauthenticated access to `/admin/*` redirects to login. API routes return 401 JSON.

---

## User roles

| Role | Access |
|---|---|
| `admin` | Full access to all features |
| `recruiter` | All access except user management |
| `viewer` | Read-only (enforced at API route level) |

Role is stored in the JWT session payload. Middleware checks authentication only, not role.
