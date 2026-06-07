import "dotenv/config";
import { Job, Queue, ConnectionOptions } from "bullmq";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { getRedisConnection } from "../redis";

const matchQueue = new Queue("match", {
  connection: getRedisConnection(),
  defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 5000 } },
});

async function enqueueMatchForRequirements(candidateId: string) {
  const openReqs = await dbQuery<{ requirement_id: string }>(
    `SELECT DISTINCT a.requirement_id
     FROM applications a
     JOIN requirements r ON r.id = a.requirement_id
     WHERE a.candidate_id = $1
       AND r.status = 'open'`,
    [candidateId]
  );
  for (const { requirement_id } of openReqs) {
    const jobId = `match-${requirement_id}`;
    const existing = await matchQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState().catch(() => "unknown");
      if (state === "waiting" || state === "active" || state === "delayed") continue;
      await existing.remove().catch(() => {});
    }
    await matchQueue.add("compute", { requirementId: requirement_id, topN: 50 }, { jobId });
    console.log(`[cv-parse] Auto-enqueued match for requirement ${requirement_id}`);
  }
}
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

async function callClaude(prompt: string, maxTokens = 4096): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0] as { type: string; text: string };
  if (block.type !== "text") throw new Error("Unexpected Claude response type");
  return block.text;
}

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s !== -1 && e !== -1) return text.slice(s, e + 1);
  return text.trim();
}

async function parseCVWithAI(rawText: string, confidence: number) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Use tool_use to guarantee structured JSON — eliminates all parse failures
  const extractTool = {
    name: "extract_cv",
    description: "Extract all structured information from a CV or resume. Extract EVERY section present in the document.",
    input_schema: {
      type: "object" as const,
      properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string", description: "Primary phone with country code" },
        linkedin: { type: "string", description: "Full LinkedIn URL" },
        github: { type: "string", description: "Full GitHub URL" },
        portfolio: { type: "string", description: "Personal website or portfolio URL" },
        location: { type: "string", description: "City, Country e.g. 'Bangalore, India'" },
        current_title: { type: "string" },
        current_company: { type: "string" },
        total_experience_years: { type: "number", description: "Total professional years. Calculate from role dates if not stated." },
        headline: { type: "string", description: "Single recruiter-facing line e.g. 'Senior Full-Stack Engineer · 8 yrs · Fintech'" },
        domain: { type: "string", description: "Primary specialization e.g. 'Full-Stack Web Development'" },
        seniority: { type: "string", enum: ["intern","junior","mid","senior","lead","principal","executive"] },
        roles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              company: { type: "string" },
              location: { type: "string" },
              start_date: { type: "string", description: "YYYY-MM preferred" },
              end_date: { type: "string" },
              is_current: { type: "boolean" },
              duration_months: { type: "number" },
              summary: { type: "string", description: "1-2 sentence role overview" },
              achievements: { type: "array", items: { type: "string" }, description: "Measurable accomplishments e.g. 'Reduced latency by 40%'" }
            },
            required: ["title", "company", "is_current"]
          }
        },
        projects: {
          type: "array",
          description: "Personal projects, side projects, open source contributions, freelance work",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              technologies: { type: "array", items: { type: "string" } },
              url: { type: "string" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              highlights: { type: "array", items: { type: "string" } },
              is_open_source: { type: "boolean" }
            },
            required: ["name"]
          }
        },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              institution: { type: "string" },
              degree: { type: "string" },
              field: { type: "string" },
              graduation_year: { type: "string" },
              grade: { type: "string" }
            },
            required: ["institution"]
          }
        },
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              skill: { type: "string", description: "Canonical name: 'JS'→'JavaScript', 'k8s'→'Kubernetes'" },
              years: { type: "number" },
              proficiency: { type: "string", enum: ["beginner","intermediate","advanced","expert"] },
              category: { type: "string", enum: ["technical","framework","tool","language","soft","domain"] }
            },
            required: ["skill"]
          }
        },
        certifications: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, issuer: { type: "string" }, year: { type: "string" } },
            required: ["name"]
          }
        },
        awards: {
          type: "array",
          description: "Awards, honors, recognitions, hackathon wins",
          items: {
            type: "object",
            properties: { title: { type: "string" }, issuer: { type: "string" }, year: { type: "string" }, description: { type: "string" } },
            required: ["title"]
          }
        },
        publications: {
          type: "array",
          description: "Research papers, blog posts, articles, patents",
          items: {
            type: "object",
            properties: { title: { type: "string" }, publisher: { type: "string" }, year: { type: "string" }, url: { type: "string" }, description: { type: "string" } },
            required: ["title"]
          }
        },
        volunteer: {
          type: "array",
          description: "Volunteer work, community involvement",
          items: {
            type: "object",
            properties: { role: { type: "string" }, organization: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" }, description: { type: "string" } },
            required: ["role", "organization"]
          }
        },
        languages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              language: { type: "string" },
              proficiency: { type: "string", enum: ["native","fluent","professional","conversational","basic"] }
            },
            required: ["language"]
          }
        },
        raw_text_confidence: { type: "number", description: "Text extraction quality 0-1" }
      },
      required: ["full_name", "roles", "education", "skills"]
    }
  };

  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    tools: [extractTool],
    tool_choice: { type: "tool", name: "extract_cv" },
    messages: [{
      role: "user",
      content: `Extract ALL information from this CV. Be exhaustive — capture every section present including projects, awards, publications, volunteer work, certifications, and any other sections. Normalize all skill names to canonical forms. Calculate experience durations precisely. Confidence value for text extraction is ${confidence}.

CV TEXT:
${rawText.slice(0, 15000)}`
    }]
  });

  const toolUse = msg.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured extraction");
  }

  const parsed = toolUse.input as Record<string, unknown>;
  parsed.raw_text_confidence = confidence;
  return parsed;
}

async function generateEnhancedSummary(parsedCV: Record<string, unknown>): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const roles = (parsedCV.roles as Array<{ title: string; company: string; achievements?: string[] }> || [])
    .slice(0, 3)
    .map(r => `${r.title} at ${r.company}${r.achievements?.length ? `: ${r.achievements.slice(0, 2).join("; ")}` : ""}`)
    .join(". ");

  const skills = (parsedCV.skills as Array<{ skill: string }> || [])
    .slice(0, 10).map(s => s.skill).join(", ");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Write a 3-4 sentence professional recruiter summary for this candidate. Mention actual skills, specific companies and concrete achievements. Write in third person. Do not use filler phrases like "results-driven", "passionate", "dynamic", or "proven track record".

Name: ${parsedCV.full_name || "Unknown"}
Headline: ${parsedCV.headline || parsedCV.current_title || "N/A"}
Experience: ${parsedCV.total_experience_years || "?"} years | Domain: ${parsedCV.domain || "N/A"} | Seniority: ${parsedCV.seniority || "N/A"}
Recent roles: ${roles || "N/A"}
Top skills: ${skills || "N/A"}

Return only the summary paragraph.`
    }]
  });

  const block = msg.content[0] as { type: string; text: string };
  return (block.type === "text" ? block.text : "").trim();
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
    throw new Error(`Embeddings API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

async function notifyAdmins(title: string, body: string, entityId: string) {
  try {
    const adminUsers = await dbQuery<{ id: string }>(
      "SELECT id FROM users WHERE role IN ('admin', 'recruiter')"
    );
    for (const user of adminUsers) {
      await dbQuery(
        `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id)
         VALUES ($1, $2, 'parse_failed', $3, $4, 'candidate_profile', $5)`,
        [uuidv4(), user.id, title, body, entityId]
      );
    }
  } catch (err) {
    console.error("[cv-parse] Failed to send admin notification:", err);
  }
}

export async function cvParseProcessor(job: Job): Promise<void> {
  const { profileId, candidateId, applicationId, cvKey, mimeType } = job.data;
  const isLastAttempt = job.attemptsMade >= (job.opts?.attempts ?? 3) - 1;

  console.log(`[cv-parse] Processing profile ${profileId} (attempt ${job.attemptsMade + 1})`);

  await dbQuery(
    "UPDATE candidate_profiles SET parse_status = 'processing' WHERE id = $1",
    [profileId]
  );
  await dbQuery(
    "UPDATE applications SET status = 'parsing', updated_at = NOW() WHERE id = $1",
    [applicationId]
  );

  try {
    // Step 1: Download CV from S3
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
    const s3Response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: cvKey }));

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
        [profileId, "Could not extract sufficient text from CV — file may be image-based or corrupted"]
      );
      await dbQuery(
        "UPDATE applications SET status = 'parse_failed', updated_at = NOW() WHERE id = $1",
        [applicationId]
      );
      await notifyAdmins(
        "CV requires manual review",
        `Profile ${profileId}: text extraction yielded < 50 characters`,
        profileId
      );
      return;
    }

    // Step 3: AI-powered structured extraction
    const parsedCV = await parseCVWithAI(rawText, confidence);

    // Step 4: Calculate total_experience_years from roles if AI missed it
    if (!parsedCV.total_experience_years && (parsedCV.roles as unknown[] | undefined)?.length) {
      const now = new Date();
      let totalMonths = 0;
      for (const role of parsedCV.roles as Array<{ start_date?: string; end_date?: string; is_current?: boolean; duration_months?: number }>) {
        if (role.duration_months) {
          totalMonths += role.duration_months;
        } else if (role.start_date) {
          const start = new Date(role.start_date + (role.start_date.length === 7 ? "-01" : ""));
          const end = role.is_current || !role.end_date
            ? now
            : new Date(role.end_date + (role.end_date.length === 7 ? "-01" : ""));
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            totalMonths += Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
          }
        }
      }
      if (totalMonths > 0) {
        parsedCV.total_experience_years = Math.round((totalMonths / 12) * 10) / 10;
      }
    }

    // Step 5: AI-enhanced recruiter summary
    const summary = await generateEnhancedSummary(parsedCV);
    parsedCV.summary = summary;

    // Step 6: Update candidate core fields from parsed data
    const [cand] = await dbQuery<{
      id: string; primary_email: string | null; primary_phone: string | null; full_name: string | null;
    }>(
      "SELECT id, primary_email, primary_phone, full_name FROM candidates WHERE id = $1",
      [candidateId]
    );

    if (cand) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (parsedCV.email && !cand.primary_email) {
        params.push((parsedCV.email as string).toLowerCase());
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
      if (parsedCV.headline) {
        params.push(parsedCV.headline);
        updates.push(`headline = $${params.length}`);
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
      if (parsedCV.location) {
        params.push(parsedCV.location);
        updates.push(`location = $${params.length}`);
      }

      if (updates.length > 0) {
        params.push(candidateId);
        await dbQuery(
          `UPDATE candidates SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
          params
        );
      }
    }

    // Step 7: Save parsed profile
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

    // Step 8: Upsert candidate skills
    const skills = (parsedCV.skills || []) as Array<{
      skill: string; years?: number; proficiency?: string; category?: string;
    }>;
    if (skills.length > 0) {
      await dbQuery("DELETE FROM candidate_skills WHERE candidate_id = $1", [candidateId]);
      for (const skill of skills) {
        if (!skill.skill?.trim()) continue;
        const normalized = skill.skill.toLowerCase().trim().replace(/[\s.]+/g, "_");
        await dbQuery(
          `INSERT INTO candidate_skills (id, candidate_id, skill, skill_normalized, years, proficiency)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [candidateId, skill.skill.trim(), normalized, skill.years || null, skill.proficiency || null]
        );
      }
    }

    // Step 9: Generate and store vector embedding
    const embeddingParts = [
      summary,
      parsedCV.headline,
      parsedCV.current_title,
      parsedCV.domain,
      skills.slice(0, 20).map(s => s.skill).join(", "),
      (parsedCV.roles as Array<{ title: string; company: string }> || [])
        .slice(0, 4)
        .map(r => `${r.title} at ${r.company}`)
        .join(". "),
    ].filter(Boolean).join(". ");

    const embedding = await generateEmbedding(embeddingParts);
    await dbQuery(
      "UPDATE candidate_profiles SET embedding = $1 WHERE id = $2",
      [`[${embedding.join(",")}]`, profileId]
    );

    // Step 10: Mark application as parsed
    await dbQuery(
      "UPDATE applications SET status = 'parsed', updated_at = NOW() WHERE id = $1",
      [applicationId]
    );

    // Step 11: Auto-trigger match for all open requirements this candidate applied to
    await enqueueMatchForRequirements(candidateId);

    console.log(`[cv-parse] Completed profile ${profileId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cv-parse] Error on profile ${profileId} (attempt ${job.attemptsMade + 1}):`, message);

    // Only mark as permanently failed on the last attempt so retries
    // don't leave the profile in 'failed' before all attempts are exhausted.
    if (isLastAttempt) {
      await dbQuery(
        `UPDATE candidate_profiles SET parse_status = 'failed', parse_error = $2 WHERE id = $1`,
        [profileId, message]
      );
      await dbQuery(
        "UPDATE applications SET status = 'parse_failed', updated_at = NOW() WHERE id = $1",
        [applicationId]
      );
      await notifyAdmins(
        "CV parse failed",
        `Profile ${profileId}: ${message.slice(0, 200)}`,
        profileId
      );
    }

    throw err;
  }
}
