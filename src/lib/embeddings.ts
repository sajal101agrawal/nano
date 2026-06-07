import { query, queryOne } from "./db";

const DIMENSIONS = parseInt(process.env.EMBEDDINGS_DIMENSIONS || "1536");
const MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

async function generateEmbeddingWithRetry(
  text: string,
  retries = 3
): Promise<number[]> {
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: text.slice(0, 8192),
          model: MODEL,
          dimensions: DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorData}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return data.data[0].embedding;
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise((r) =>
          setTimeout(r, Math.min(1000 * Math.pow(2, i), 8000))
        );
      }
    }
  }

  throw lastError;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return generateEmbeddingWithRetry(text);
}

export function buildCandidateEmbeddingText(data: {
  summary?: string;
  skills?: Array<{ skill: string }>;
  currentTitle?: string;
  currentCompany?: string;
  roles?: Array<{ title: string; company: string; summary?: string }>;
}): string {
  const parts: string[] = [];

  if (data.summary) parts.push(data.summary);
  if (data.currentTitle) parts.push(`Current role: ${data.currentTitle}`);
  if (data.currentCompany) parts.push(`at ${data.currentCompany}`);

  if (data.skills?.length) {
    parts.push(`Skills: ${data.skills.map((s) => s.skill).join(", ")}`);
  }

  if (data.roles?.length) {
    const recentRoles = data.roles.slice(0, 3);
    const roleText = recentRoles
      .map((r) => `${r.title} at ${r.company}${r.summary ? `: ${r.summary}` : ""}`)
      .join(". ");
    parts.push(`Experience: ${roleText}`);
  }

  return parts.join(". ");
}

export async function storeCandidateEmbedding(
  profileId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await query(
    "UPDATE candidate_profiles SET embedding = $1 WHERE id = $2",
    [vectorStr, profileId]
  );
}

export async function storeRequirementEmbedding(
  requirementId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await query(
    "UPDATE requirements SET embedding = $1 WHERE id = $2",
    [vectorStr, requirementId]
  );
}

export async function searchSimilarCandidates(
  jdEmbedding: number[],
  limit = 50,
  filters?: {
    availabilityFilter?: string[];
    minExperience?: number;
    openToContract?: boolean;
  }
): Promise<
  Array<{
    candidate_id: string;
    profile_id: string;
    vector_score: number;
  }>
> {
  const vectorStr = `[${jdEmbedding.join(",")}]`;

  let whereClause = "WHERE cp.is_current = TRUE AND c.status = 'active'";
  const params: unknown[] = [vectorStr, limit];

  if (filters?.availabilityFilter?.length) {
    const placeholders = filters.availabilityFilter
      .map((_, i) => `$${params.length + 1 + i}`)
      .join(", ");
    whereClause += ` AND c.availability_status IN (${placeholders})`;
    params.push(...filters.availabilityFilter);
  }

  if (filters?.minExperience !== undefined) {
    params.push(filters.minExperience);
    whereClause += ` AND cp.total_experience_years >= $${params.length}`;
  }

  if (filters?.openToContract === true) {
    whereClause += " AND c.open_to_contract = TRUE";
  }

  const sql = `
    SELECT
      c.id AS candidate_id,
      cp.id AS profile_id,
      1 - (cp.embedding <=> $1::vector) AS vector_score
    FROM candidate_profiles cp
    JOIN candidates c ON c.id = cp.candidate_id
    ${whereClause}
    ORDER BY cp.embedding <=> $1::vector
    LIMIT $2
  `;

  return query<{ candidate_id: string; profile_id: string; vector_score: number }>(
    sql,
    params
  );
}
