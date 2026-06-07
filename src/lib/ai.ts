import Anthropic from "@anthropic-ai/sdk";
import type { ParsedCV, ParsedRequirements } from "@/types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-3-5-sonnet-20241022";

async function callClaude(
  prompt: string,
  maxTokens = 4096,
  retries = 3
): Promise<string> {
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      const block = msg.content[0];
      if (block.type !== "text") throw new Error("Unexpected response type");
      return block.text;
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        message.includes("rate_limit") || message.includes("529");
      const delay = isRateLimit
        ? 30000
        : Math.min(1000 * Math.pow(2, i), 10000);

      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return text.slice(jsonStart, jsonEnd + 1);
  }

  return text.trim();
}

export async function extractCVStructured(rawText: string): Promise<ParsedCV> {
  const prompt = `Extract structured information from this CV/resume. Return ONLY valid JSON matching the exact schema below. No explanation, no markdown, just JSON.

Schema:
{
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "linkedin": string | null,
  "github": string | null,
  "current_title": string | null,
  "current_company": string | null,
  "total_experience_years": number | null,
  "summary": string (2-3 sentences) | null,
  "roles": [{ "title": string, "company": string, "start_date": string | null, "end_date": string | null, "is_current": boolean, "summary": string | null }],
  "education": [{ "institution": string, "degree": string | null, "field": string | null, "graduation_year": string | null }],
  "skills": [{ "skill": string, "years": number | null, "proficiency": "beginner" | "intermediate" | "advanced" | "expert" | null }],
  "raw_text_confidence": number (0-1)
}

CV Text:
${rawText.slice(0, 12000)}`;

  const response = await callClaude(prompt, 2048);
  const jsonStr = extractJSON(response);

  try {
    return JSON.parse(jsonStr) as ParsedCV;
  } catch {
    throw new Error(
      `Failed to parse Claude CV response as JSON: ${jsonStr.slice(0, 200)}`
    );
  }
}

export async function generateCandidateSummary(
  parsedCV: ParsedCV
): Promise<string> {
  const prompt = `Write a 2-3 sentence professional summary of this candidate for a recruiter. Be factual and concise. Focus on their level, key skills, and standout points. No fluff.

Candidate data:
${JSON.stringify(parsedCV, null, 2).slice(0, 4000)}

Return only the summary text, nothing else.`;

  const response = await callClaude(prompt, 256);
  return response.trim();
}

export async function extractJDRequirements(
  jdText: string
): Promise<ParsedRequirements> {
  const prompt = `Extract structured requirements from this job description. Return ONLY valid JSON matching the schema below. No explanation.

Schema:
{
  "required_skills": string[],
  "nice_to_have_skills": string[],
  "min_experience_years": number | null,
  "max_experience_years": number | null,
  "engagement_type": "contract" | "fulltime" | "both" | null,
  "location": string | null,
  "work_mode": "remote" | "onsite" | "hybrid" | "flexible" | null,
  "budget_range": string | null,
  "key_responsibilities": string[],
  "qualifications": string[]
}

Job Description:
${jdText.slice(0, 8000)}`;

  const response = await callClaude(prompt, 1024);
  const jsonStr = extractJSON(response);

  try {
    return JSON.parse(jsonStr) as ParsedRequirements;
  } catch {
    throw new Error("Failed to parse JD requirements");
  }
}

export async function rankCandidatesForRequirement(
  jdRequirements: ParsedRequirements,
  candidates: Array<{
    id: string;
    profile: ParsedCV;
    availability: string;
    openToContract: boolean;
    noticePeriodDays?: number;
    expectedRate?: string;
    location?: string;
  }>
): Promise<
  Array<{
    candidateId: string;
    score: number;
    rationale: string;
  }>
> {
  if (candidates.length === 0) return [];

  const candidateList = candidates
    .map(
      (c, i) =>
        `Candidate ${i + 1} (ID: ${c.id}):
Name: ${c.profile.full_name || "Unknown"}
Title: ${c.profile.current_title || "N/A"}
Experience: ${c.profile.total_experience_years || "?"} years
Skills: ${(c.profile.skills || []).map((s) => s.skill).join(", ")}
Availability: ${c.availability}
Open to contract: ${c.openToContract}
Notice period: ${c.noticePeriodDays ? `${c.noticePeriodDays} days` : "unknown"}
Expected rate: ${c.expectedRate || "not specified"}
Location: ${c.location || "not specified"}
Summary: ${c.profile.summary || "N/A"}`
    )
    .join("\n\n---\n\n");

  const prompt = `You are a technical recruiter. Rank these candidates for the following job requirement.

Job Requirements:
Required Skills: ${jdRequirements.required_skills.join(", ")}
Min Experience: ${jdRequirements.min_experience_years || "N/A"} years
Engagement: ${jdRequirements.engagement_type || "N/A"}
Work Mode: ${jdRequirements.work_mode || "N/A"}
Location: ${jdRequirements.location || "N/A"}

Candidates:
${candidateList}

Return ONLY a JSON array with scores and rationales:
[
  {
    "candidateId": string,
    "score": number (0-100),
    "rationale": string (1-2 sentences explaining the score, specific and factual)
  }
]

Score based on: skill match, experience level, availability, contract openness, rate fit, location fit. A "unavailable" candidate should be scored significantly lower. Return all ${candidates.length} candidates.`;

  const response = await callClaude(prompt, 2048, 3);
  const jsonStr = extractJSON(response);

  try {
    return JSON.parse(jsonStr) as Array<{
      candidateId: string;
      score: number;
      rationale: string;
    }>;
  } catch {
    return candidates.map((c) => ({
      candidateId: c.id,
      score: 50,
      rationale: "Auto-ranked (AI response parse error)",
    }));
  }
}

export async function generateProspectSummary(
  enrichmentData: Record<string, unknown>
): Promise<string> {
  const prompt = `Write a 2-sentence professional summary of this person for a recruiter. Based on their profile data below. Be factual, concise.

Profile:
${JSON.stringify(enrichmentData, null, 2).slice(0, 2000)}

Return only the summary text.`;

  const response = await callClaude(prompt, 256);
  return response.trim();
}
