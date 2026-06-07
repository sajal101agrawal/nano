import "dotenv/config";
import { Job } from "bullmq";
import { Pool } from "pg";
import fetch from "node-fetch";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

async function dbQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      input: text.slice(0, 8192),
      model: process.env.EMBEDDINGS_MODEL || "text-embedding-3-small",
      dimensions: parseInt(process.env.EMBEDDINGS_DIMENSIONS || "1536"),
    }),
  });

  if (!response.ok) throw new Error(`Embeddings API error: ${response.status}`);
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

export async function matchProcessor(job: Job): Promise<void> {
  const { requirementId, topN = 50 } = job.data;

  console.log(`[match] Computing matches for requirement ${requirementId}`);

  const reqRows = await dbQuery<{
    id: string;
    jd_raw: string;
    parsed_requirements_json: string;
    engagement_type: string;
    work_mode: string;
    min_experience: number;
    embedding: string;
  }>(
    "SELECT id, jd_raw, parsed_requirements_json, engagement_type, work_mode, min_experience, embedding FROM requirements WHERE id = $1",
    [requirementId]
  );

  if (!reqRows.length) {
    console.warn(`[match] Requirement ${requirementId} not found`);
    return;
  }

  const req = reqRows[0];

  // Ensure requirement has embedding
  let reqEmbedding: number[];
  if (!req.embedding) {
    const embText = `${req.jd_raw}`.slice(0, 4000);
    reqEmbedding = await generateEmbedding(embText);
    await dbQuery(
      "UPDATE requirements SET embedding = $1 WHERE id = $2",
      [`[${reqEmbedding.join(",")}]`, requirementId]
    );
  } else {
    // embedding is stored as a postgres vector string: "[0.1,0.2,...]"
    reqEmbedding = req.embedding
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(Number);
  }

  // Vector similarity search
  const vectorStr = `[${reqEmbedding.join(",")}]`;

  let whereClause = "WHERE cp.is_current = TRUE AND c.status = 'active'";
  const params: unknown[] = [vectorStr, topN];

  if (req.min_experience) {
    params.push(req.min_experience);
    whereClause += ` AND COALESCE(cp.total_experience_years, 0) >= $${params.length}`;
  }

  const candidates = await dbQuery<{
    candidate_id: string;
    profile_id: string;
    vector_score: number;
    full_name: string;
    availability_status: string;
    open_to_contract: boolean;
    notice_period_days: number;
    expected_rate: string;
    location: string;
    parsed_json: string;
    summary: string;
  }>(
    `SELECT
      c.id AS candidate_id,
      cp.id AS profile_id,
      1 - (cp.embedding <=> $1::vector) AS vector_score,
      c.full_name,
      c.availability_status,
      c.open_to_contract,
      c.notice_period_days,
      c.expected_rate,
      c.location,
      cp.parsed_json,
      cp.summary
    FROM candidate_profiles cp
    JOIN candidates c ON c.id = cp.candidate_id
    ${whereClause}
    ORDER BY cp.embedding <=> $1::vector
    LIMIT $2`,
    params
  );

  if (!candidates.length) {
    console.log(`[match] No candidates found for requirement ${requirementId}`);
    return;
  }

  // Apply hard rule filters and compute rule scores
  const parsedReqs = req.parsed_requirements_json
    ? JSON.parse(req.parsed_requirements_json as unknown as string)
    : {};

  const scored = candidates.map((c) => {
    let ruleScore = 1.0;
    const reasons: string[] = [];

    if (c.availability_status === "unavailable") {
      ruleScore *= 0.1;
      reasons.push("unavailable");
    } else if (c.availability_status === "unknown") {
      ruleScore *= 0.6;
      reasons.push("availability unknown");
    }

    if (req.engagement_type === "contract" && c.open_to_contract === false) {
      ruleScore *= 0.3;
      reasons.push("not open to contract");
    }

    const combinedScore =
      (c.vector_score * 0.6 + ruleScore * 0.4) * 100;

    return {
      candidate_id: c.candidate_id,
      vector_score: c.vector_score,
      rule_score: ruleScore,
      score: Math.min(100, Math.max(0, combinedScore)),
    };
  });

  // Re-rank top 20 with Claude
  const top20 = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const candidateList = top20
    .map((s) => {
      const c = candidates.find((c) => c.candidate_id === s.candidate_id)!;
      const parsed = c.parsed_json
        ? JSON.parse(c.parsed_json as unknown as string)
        : {};
      return `ID: ${s.candidate_id}
Name: ${c.full_name || "Unknown"}
Availability: ${c.availability_status}
Open to contract: ${c.open_to_contract}
Notice: ${c.notice_period_days ? `${c.notice_period_days}d` : "?"}
Skills: ${parsed.skills?.slice(0, 10).map((sk: { skill: string }) => sk.skill).join(", ")}
Summary: ${c.summary || "N/A"}`;
    })
    .join("\n---\n");

  let aiRankings: Array<{ candidateId: string; score: number; rationale: string }> = [];

  try {
    const msg = await aiClient.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Rank these candidates for the job. Return only JSON array.

Job: ${(req.parsed_requirements_json as unknown as string || req.jd_raw).slice(0, 1500)}

Candidates:
${candidateList}

Return: [{"candidateId": string, "score": number (0-100), "rationale": string (1-2 sentences)}]`,
      }],
    });

    const text = (msg.content[0] as { type: "text"; text: string }).text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      aiRankings = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.warn("[match] AI re-ranking failed, using vector scores:", err);
  }

  // Merge AI scores into results
  const aiMap = new Map(aiRankings.map((r) => [r.candidateId, r]));
  const finalScored = scored.map((s) => {
    const ai = aiMap.get(s.candidate_id);
    return {
      ...s,
      final_score: ai ? ai.score : s.score,
      rationale: ai?.rationale || `Vector similarity: ${(s.vector_score * 100).toFixed(0)}%`,
    };
  });

  // Upsert matches
  for (const m of finalScored) {
    await dbQuery(
      `INSERT INTO matches (id, requirement_id, candidate_id, score, vector_score, rule_score, rationale, generated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (requirement_id, candidate_id) DO UPDATE SET
         score = EXCLUDED.score,
         vector_score = EXCLUDED.vector_score,
         rule_score = EXCLUDED.rule_score,
         rationale = EXCLUDED.rationale,
         generated_at = EXCLUDED.generated_at`,
      [
        requirementId,
        m.candidate_id,
        m.final_score,
        m.vector_score,
        m.rule_score,
        m.rationale,
      ]
    );
  }

  console.log(`[match] Computed ${finalScored.length} matches for requirement ${requirementId}`);
}
