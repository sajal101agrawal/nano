# AI & Matching

## Overview

Nano uses two AI providers:

- **Anthropic Claude** (`claude-sonnet-4-5`) — CV structured extraction, recruiter summary generation, JD requirements parsing, and candidate re-ranking
- **OpenAI** (`text-embedding-3-small`, 1536 dimensions) — semantic vector embeddings for candidates and job descriptions

The matching pipeline combines vector similarity (semantic relevance) with rule-based scoring (practical eligibility) and a final Claude re-ranking step.

---

## CV parsing pipeline

CV parsing runs in the BullMQ worker after every new application. It transforms a raw PDF or DOCX into a structured, queryable candidate profile.

### Step 1: Text extraction

Two libraries handle text extraction depending on the file format:

- **DOCX** → `mammoth.extractRawText()`. Confidence: 1.0 if no warnings, 0.8 otherwise.
- **PDF / DOC** → `pdf-parse`. Confidence: 1.0 if pages > 0 and text.length > 100, 0.6 otherwise.

If the extracted text is fewer than 50 characters, the profile is marked `review_required` and admins are notified. This handles image-only PDFs or corrupted files.

### Step 2: Structured extraction via Claude tool_use

Rather than asking Claude to return JSON in its text response (fragile — Claude may add prose), the worker uses Claude's `tool_use` feature with a strict `extract_cv` tool schema. This guarantees the output is parsed from the tool input, not from text, eliminating parse failures.

The `extract_cv` tool defines ~20 top-level fields with nested arrays for roles, education, skills, projects, certifications, awards, publications, volunteer work, and languages. Required fields: `full_name`, `roles`, `education`, `skills`.

**Normalization the model is asked to do:**
- Skill names are canonicalized: `JS` → `JavaScript`, `k8s` → `Kubernetes`
- Experience durations are calculated precisely from dates if not stated
- Seniority is inferred from role history: `intern`, `junior`, `mid`, `senior`, `lead`, `principal`, `executive`
- Headline is a single recruiter-facing line: `"Senior Full-Stack Engineer · 8 yrs · Fintech"`

**Token limits:**
- CV text is truncated at 15,000 characters before being sent to Claude
- Max response tokens: 4,096

### Step 3: Experience calculation fallback

If Claude does not return `total_experience_years`, the worker calculates it from role date ranges:

1. For each role, compute duration from `start_date` to `end_date` (or current date if `is_current`)
2. Sum all durations in months
3. Convert to years, rounded to 1 decimal place

Dates in `YYYY-MM` format are parsed by appending `-01`. Invalid dates are skipped.

### Step 4: Recruiter summary generation

A separate Claude call generates a 3–4 sentence professional summary. The prompt explicitly bans filler phrases ("results-driven", "passionate", "dynamic", "proven track record") and instructs the model to mention actual companies, specific skills, and concrete achievements from the CV data.

Input: condensed candidate data — name, headline, experience, domain, seniority, top 3 roles with achievements, top 10 skills.

Max response tokens: 512.

### Step 5: Candidate core field update

After parsing, the worker updates the `candidates` table with extracted data. The update uses `COALESCE` semantics — it only fills `NULL` fields and never overwrites existing values. This is important for re-parses: a candidate's email is set from their first CV and should not be overwritten by a different CV.

Fields updated: `primary_email`, `primary_phone`, `full_name`, `headline`, `current_title`, `current_company`, `total_experience_years`, `location`.

### Step 6: Skill denormalization

All skills from `parsed_json.skills` are deleted and re-inserted into `candidate_skills`. The `skill_normalized` column stores a lowercase, underscore-separated version of each skill name for exact-match queries.

```
"JavaScript" → "javascript"
"React.js" → "react_js"
"AWS S3" → "aws_s3"
```

### Step 7: Embedding generation

The embedding is generated from a composite text string:

```
<summary>. Current role: <current_title> at <current_company>. Skills: <top 20 skills>. Experience: <top 4 roles as "title at company">. <headline>. <domain>
```

This composite ensures the embedding captures skill breadth, role context, and the recruiter summary — more than just the raw CV text.

The text is sent to OpenAI's `text-embedding-3-small` model with `dimensions=1536` and stored as `vector(1536)` on `candidate_profiles.embedding`.

---

## Requirement parsing

When a new requirement is created via the admin dashboard (`POST /api/admin/requirements`), Claude parses the raw JD text into structured fields.

**Function:** `extractJDRequirements()` in `src/lib/ai.ts`

**Output schema:**
```json
{
  "required_skills": ["React", "TypeScript"],
  "nice_to_have_skills": ["GraphQL"],
  "min_experience_years": 4,
  "max_experience_years": 8,
  "engagement_type": "contract",
  "location": "Bengaluru",
  "work_mode": "hybrid",
  "budget_range": "50-80 LPA",
  "key_responsibilities": [...],
  "qualifications": [...]
}
```

The requirement's `embedding` is generated separately (lazily in the match processor if missing) from the full `jd_raw` text (truncated at 4,000 characters).

---

## Matching algorithm

The matching pipeline runs in the `matchProcessor` worker processor. It runs after each CV parse (auto-triggered) and can be manually triggered from the admin dashboard.

### Stage 1: Vector similarity search

```sql
SELECT
  c.id AS candidate_id,
  cp.id AS profile_id,
  1 - (cp.embedding <=> $1::vector) AS vector_score,
  c.full_name, c.availability_status, c.open_to_contract,
  c.notice_period_days, c.expected_rate, c.location,
  cp.parsed_json, cp.summary
FROM candidate_profiles cp
JOIN candidates c ON c.id = cp.candidate_id
WHERE cp.is_current = TRUE AND c.status = 'active'
  [AND cp.total_experience_years >= min_experience]
ORDER BY cp.embedding <=> $1::vector
LIMIT 50
```

The `<=>` operator is pgvector's cosine distance operator. The HNSW index makes this sub-millisecond even with tens of thousands of candidates.

`vector_score` is `1 - cosine_distance`, so it ranges 0 (no similarity) to 1 (identical vectors).

**Applicant guarantee:** All candidates who have explicitly applied for the requirement are fetched separately and merged into the pool, even if they fall outside the top-N similarity results. This ensures applicants are never excluded from the match list.

### Stage 2: Rule-based score adjustment

Each candidate gets a `rule_score` starting at `1.0`. Multipliers are applied based on practical eligibility:

| Condition | Multiplier | Effect |
|---|---|---|
| `availability_status = unavailable` | 0.1 | Severely penalizes unavailable candidates |
| `availability_status = unknown` | 0.6 | Moderately penalizes unknown availability |
| `open_to_contract = false` AND req is contract-only | 0.3 | Penalizes candidates not open to contract |

Multipliers are cumulative. A candidate who is unavailable and not open to contract gets `1.0 × 0.1 × 0.3 = 0.03`.

### Stage 3: Combined score

```
combined_score = (vector_score × 0.6 + rule_score × 0.4) × 100
```

Clamped to `[0, 100]`.

The 60/40 split gives semantic relevance slightly more weight than practical eligibility, since availability can change but skill fit is stable.

### Stage 4: Claude re-ranking (top 20)

The top 20 candidates by combined score are re-ranked by Claude. This step adds human-quality reasoning that pure vector search cannot provide.

**Prompt structure:**
- Job description (truncated to 1,500 characters)
- For each of the 20 candidates: ID, name, availability, contract openness, notice period, top 10 skills, summary

**Output:**
```json
[
  {
    "candidateId": "uuid",
    "score": 87,
    "rationale": "Strong React and TypeScript background with 6 years of relevant fintech experience. Currently available and open to contract."
  }
]
```

Scoring criteria Claude is asked to consider: skill match, experience level, availability, contract openness, rate fit, location fit.

### Stage 5: Merge and store

- Candidates in the Claude response → use the AI score
- Candidates outside the top 20 → use the combined score from Stage 3
- All results are upserted into the `matches` table with `ON CONFLICT DO UPDATE`

This means re-running matches for the same requirement updates existing scores rather than creating duplicates.

---

## Claude integration details (`src/lib/ai.ts`)

### `callClaude(prompt, maxTokens, retries)`

Wrapper around `client.messages.create()` with:
- Configurable retry count (default 3)
- Rate limit detection: errors containing `rate_limit` or `529` trigger a 30-second pause
- Other errors use exponential backoff capped at 10 seconds
- Throws after all retries are exhausted

### `extractJSON(text)`

Utility for extracting JSON from Claude text responses (used in JD parsing and ranking):
1. First tries to extract a fenced code block (` ```json ... ``` `)
2. Falls back to finding the outermost `{...}` span

### Functions

| Function | Input | Output | Used in |
|---|---|---|---|
| `extractCVStructured(rawText)` | CV text string | `ParsedCV` | App-level quick parse |
| `generateCandidateSummary(parsedCV)` | Parsed CV object | Summary string | App-level |
| `extractJDRequirements(jdText)` | JD text string | `ParsedRequirements` | Requirement creation |
| `rankCandidatesForRequirement(jdReqs, candidates)` | JD requirements + candidate array | Ranked array with scores | App-level matching |
| `generateProspectSummary(enrichmentData)` | Apollo enrichment JSON | Summary string | Prospect enrichment |

Note: The worker (`cvParse.ts`) uses its own inline Claude calls with `tool_use` rather than these lib functions, because `tool_use` provides stronger guarantees during batch processing.

---

## Embedding integration details (`src/lib/embeddings.ts`)

### `generateEmbedding(text)`

Calls OpenAI's `/v1/embeddings` API with:
- Text truncated at 8,192 characters
- Model from `EMBEDDINGS_MODEL` env var (default: `text-embedding-3-small`)
- Dimensions from `EMBEDDINGS_DIMENSIONS` env var (default: 1536)
- 3 retries with exponential backoff

### `buildCandidateEmbeddingText(data)`

Constructs the composite string used for candidate embeddings:
```
<summary>. Current role: <title> at <company>. Skills: <skill1, skill2...>. Experience: <role1 at company1>. <role2 at company2>. <role3 at company3>.
```

### `searchSimilarCandidates(jdEmbedding, limit, filters?)`

Direct vector search function used in the app (not the worker). Accepts optional filters:
- `availabilityFilter: string[]` — `IN (...)` clause on `availability_status`
- `minExperience: number` — `>= X` clause on `total_experience_years`
- `openToContract: boolean` — exact match on `candidates.open_to_contract`

### Vector storage format

pgvector stores vectors as `vector(N)` columns. When inserting from JavaScript, the vector must be formatted as a bracket-enclosed comma-separated string:

```typescript
`[${embedding.join(",")}]`
```

This is then cast to the `vector` type with `$1::vector` in SQL.

---

## Tuning the matching algorithm

### Changing the vector/rule score weights

In `src/worker/processors/match.ts`:

```typescript
const combinedScore = (c.vector_score * 0.6 + ruleScore * 0.4) * 100;
```

Increase the first multiplier (0.6) to weight semantic relevance more. Increase the second (0.4) to weight practical eligibility more.

### Changing rule score multipliers

In the same file, the penalty multipliers can be tuned:

```typescript
if (c.availability_status === "unavailable") {
  ruleScore *= 0.1;  // Increase to be less harsh on unavailable candidates
}
if (c.availability_status === "unknown") {
  ruleScore *= 0.6;  // Decrease to be more conservative about unknown availability
}
```

### Changing the top-N vector search size

The default is `topN = 50`. This controls how many candidates are fetched by the ANN search before rule scoring and Claude re-ranking.

- Higher `topN` → better recall (more candidates considered), slower processing
- Lower `topN` → faster, but risks missing relevant candidates

### Changing the Claude re-rank batch size

Currently hardcoded at 20:

```typescript
const top20 = scored.sort((a, b) => b.score - a.score).slice(0, 20);
```

Increasing this number sends more candidates to Claude, improving ranking quality at the cost of more tokens per match run.

### HNSW search parameters

For more accurate ANN search at query time (at the cost of speed):

```sql
SET hnsw.ef_search = 200;  -- default is 40
```

This can be set per connection in the worker's pool configuration.

---

## Token usage estimates

Per application (CV parse):
- Text extraction: local, no tokens
- `extract_cv` tool call: ~500–1,000 input tokens (CV text) + ~800–1,200 output tokens
- Summary generation: ~400–600 input tokens + ~150–200 output tokens
- OpenAI embedding: ~200–600 tokens (composite text)

Per match run (50 candidates, 20 re-ranked):
- Requirement embedding (if missing): ~300–800 tokens
- Claude re-rank: ~2,000–3,000 input tokens + ~400–600 output tokens
