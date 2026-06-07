import "dotenv/config";
import { Job } from "bullmq";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import fetch from "node-fetch";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

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

async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; confidence: number }> {
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      confidence: result.messages.length === 0 ? 1.0 : 0.8,
    };
  }

  if (mimeType === "application/pdf" || mimeType === "application/msword") {
    try {
      const data = await pdf(buffer);
      const confidence = data.numpages > 0 && data.text.length > 100 ? 1.0 : 0.6;
      return { text: data.text, confidence };
    } catch {
      return { text: "", confidence: 0 };
    }
  }

  return { text: "", confidence: 0 };
}

async function extractCVStructured(rawText: string) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Extract structured information from this CV/resume. Return ONLY valid JSON, no explanation.

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
  "summary": string | null,
  "roles": [{ "title": string, "company": string, "start_date": string | null, "end_date": string | null, "is_current": boolean, "summary": string | null }],
  "education": [{ "institution": string, "degree": string | null, "field": string | null, "graduation_year": string | null }],
  "skills": [{ "skill": string, "years": number | null, "proficiency": "beginner" | "intermediate" | "advanced" | "expert" | null }],
  "raw_text_confidence": number
}

CV Text:
${rawText.slice(0, 12000)}`;

  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const msg = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      const text = (msg.content[0] as { type: "text"; text: string }).text;
      const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
        [null, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
      return JSON.parse(jsonMatch[1] || "{}");
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function generateCandidateSummary(parsedCV: Record<string, unknown>): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `Write a 2-3 sentence professional summary of this candidate for a recruiter. Be factual and concise.\n\n${JSON.stringify(parsedCV).slice(0, 3000)}\n\nReturn only the summary.`,
    }],
  });
  return ((msg.content[0] as { type: "text"; text: string }).text || "").trim();
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

  if (!response.ok) {
    throw new Error(`Embeddings API error: ${response.status}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

export async function cvParseProcessor(job: Job): Promise<void> {
  const { profileId, candidateId, applicationId, cvUrl, cvKey, mimeType } = job.data;

  console.log(`[cv-parse] Processing profile ${profileId}`);

  await dbQuery(
    "UPDATE candidate_profiles SET parse_status = 'processing' WHERE id = $1",
    [profileId]
  );
  await dbQuery(
    "UPDATE applications SET status = 'parsing' WHERE id = $1",
    [applicationId]
  );

  try {
    // Step 1: Download CV
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });

    const bucket = process.env.S3_BUCKET_NAME || "nano-cvs";
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: cvKey });
    const s3Response = await s3.send(getCommand);

    const chunks: Buffer[] = [];
    for await (const chunk of s3Response.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // Step 2: Extract text
    const { text: rawText, confidence } = await extractText(buffer, mimeType);

    if (rawText.length < 50) {
      await dbQuery(
        `UPDATE candidate_profiles SET parse_status = 'review_required', parse_error = $2 WHERE id = $1`,
        [profileId, "Could not extract sufficient text from CV"]
      );
      await dbQuery(
        "UPDATE applications SET status = 'parse_failed' WHERE id = $1",
        [applicationId]
      );

      const notifyClient2 = await pool.connect();
      try {
        const adminUsers = await notifyClient2.query("SELECT id FROM users WHERE role IN ('admin', 'recruiter')");
        for (const user of adminUsers.rows) {
          await notifyClient2.query(
            `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id)
             VALUES ($1, $2, 'parse_failed', 'CV parse requires review', $3, 'candidate_profile', $4)`,
            [uuidv4(), user.id, `Profile ${profileId}: CV text extraction failed`, profileId]
          );
        }
      } finally {
        notifyClient2.release();
      }
      return;
    }

    // Step 3: Structured extraction with Claude
    const parsedCV = await extractCVStructured(rawText);
    parsedCV.raw_text_confidence = confidence;

    // Step 4: Summary
    const summary = await generateCandidateSummary(parsedCV);
    parsedCV.summary = summary;

    // Step 5: Update candidate from parsed data
    const candidate = await dbQuery<{
      id: string;
      primary_email: string;
      primary_phone: string;
      full_name: string;
    }>(
      "SELECT id, primary_email, primary_phone, full_name FROM candidates WHERE id = $1",
      [candidateId]
    );

    const cand = candidate[0];
    if (cand) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (parsedCV.email && !cand.primary_email) {
        params.push(parsedCV.email.toLowerCase());
        updates.push(`primary_email = $${params.length}`);
      }
      if (parsedCV.phone && !cand.primary_phone) {
        params.push(parsedCV.phone);
        updates.push(`primary_phone = $${params.length}`);
      }
      if (parsedCV.full_name && !cand.full_name) {
        params.push(parsedCV.full_name);
        updates.push(`full_name = $${params.length}`);
      }
      if (parsedCV.current_title) {
        params.push(parsedCV.current_title);
        updates.push(`current_title = $${params.length}`);
      }
      if (parsedCV.current_company) {
        params.push(parsedCV.current_company);
        updates.push(`current_company = $${params.length}`);
      }
      if (parsedCV.total_experience_years) {
        params.push(parsedCV.total_experience_years);
        updates.push(`total_experience_years = $${params.length}`);
      }

      if (updates.length > 0) {
        params.push(candidateId);
        await dbQuery(
          `UPDATE candidates SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
          params
        );
      }
    }

    // Step 6: Update profile with parsed data
    await dbQuery(
      `UPDATE candidate_profiles SET
        parsed_json = $1,
        summary = $2,
        total_experience_years = $3,
        current_title = $4,
        current_company = $5,
        parse_status = 'completed'
       WHERE id = $6`,
      [
        JSON.stringify(parsedCV),
        summary,
        parsedCV.total_experience_years || null,
        parsedCV.current_title || null,
        parsedCV.current_company || null,
        profileId,
      ]
    );

    // Step 7: Update candidate skills
    if (parsedCV.skills?.length > 0) {
      await dbQuery("DELETE FROM candidate_skills WHERE candidate_id = $1", [candidateId]);

      for (const skill of parsedCV.skills) {
        if (!skill.skill) continue;
        const normalized = skill.skill.toLowerCase().trim().replace(/[\s.]+/g, "_");
        await dbQuery(
          `INSERT INTO candidate_skills (id, candidate_id, skill, skill_normalized, years, proficiency)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [candidateId, skill.skill, normalized, skill.years || null, skill.proficiency || null]
        );
      }
    }

    // Step 8: Generate and store embedding
    const embeddingText = [
      summary,
      parsedCV.current_title,
      parsedCV.skills?.map((s: { skill: string }) => s.skill).join(", "),
      parsedCV.roles?.slice(0, 3).map((r: { title: string; company: string }) => `${r.title} at ${r.company}`).join(". "),
    ]
      .filter(Boolean)
      .join(". ");

    const embedding = await generateEmbedding(embeddingText);
    const vectorStr = `[${embedding.join(",")}]`;

    await dbQuery(
      "UPDATE candidate_profiles SET embedding = $1 WHERE id = $2",
      [vectorStr, profileId]
    );

    // Step 9: Update application status
    await dbQuery(
      "UPDATE applications SET status = 'parsed' WHERE id = $1",
      [applicationId]
    );

    console.log(`[cv-parse] Completed profile ${profileId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cv-parse] Error on profile ${profileId}:`, message);

    await dbQuery(
      `UPDATE candidate_profiles SET parse_status = 'failed', parse_error = $2 WHERE id = $1`,
      [profileId, message]
    );
    await dbQuery(
      "UPDATE applications SET status = 'parse_failed' WHERE id = $1",
      [applicationId]
    );

    // Notify admin
    try {
      const notifyClient = await pool.connect();
      try {
        const adminUsers = await notifyClient.query("SELECT id FROM users WHERE role IN ('admin', 'recruiter')");
        for (const user of adminUsers.rows) {
          await notifyClient.query(
            `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id)
             VALUES ($1, $2, 'parse_failed', 'CV parse failed', $3, 'candidate_profile', $4)`,
            [uuidv4(), user.id, `Profile ${profileId}: ${message}`, profileId]
          );
        }
      } finally {
        notifyClient.release();
      }
    } catch {}

    throw err;
  }
}
