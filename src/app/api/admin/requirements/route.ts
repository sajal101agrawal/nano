import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { query, queryOne, transaction } from "@/lib/db";
import { auditLog } from "@/lib/utils";
import { generateJobSlug } from "@/lib/utils";
import { enqueueMatch } from "@/lib/queue";
import { extractJDRequirements } from "@/lib/ai";
import { generateEmbedding, storeRequirementEmbedding } from "@/lib/embeddings";
import { v4 as uuidv4 } from "uuid";
import type { Requirement, RequirementQuestion, ApiResponse, PaginatedResult } from "@/types";

type RequirementRow = Requirement & {
  client_name?: string;
  application_count?: string;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const status = searchParams.get("status");
    const q = searchParams.get("q");
    const myJobs = searchParams.get("my_jobs") === "true";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(r.title ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`);
    }

    if (myJobs && session.userId) {
      params.push(session.userId);
      conditions.push(`EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.requirement_id = r.id AND ja.user_id = $${params.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countParams = [...params];
    const countRows = await query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM requirements r
       LEFT JOIN clients c ON c.id = r.client_id
       ${where}`,
      countParams
    );
    const total = parseInt(countRows[0]?.total || "0");

    params.push(limit, offset);
    const rows = await query<RequirementRow>(
      `SELECT r.*,
              c.company_name AS client_name,
              COUNT(a.id)::text AS application_count
       FROM requirements r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN applications a ON a.requirement_id = r.id
       ${where}
       GROUP BY r.id, c.company_name
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const result: PaginatedResult<RequirementRow> = {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return NextResponse.json<ApiResponse<PaginatedResult<RequirementRow>>>({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/admin/requirements GET]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession();
    const body = await req.json();

    const {
      title,
      jd_raw,
      client_id,
      engagement_type = "both",
      work_mode,
      location,
      budget_min,
      budget_max,
      budget_currency = "INR",
      budget_period = "monthly",
      screening_questions,
    } = body as {
      title: string;
      jd_raw: string;
      client_id?: string;
      engagement_type?: string;
      work_mode?: string;
      location?: string;
      budget_min?: number;
      budget_max?: number;
      budget_currency?: string;
      budget_period?: string;
      screening_questions?: Array<{
        question_text: string;
        question_type: string;
        options?: { value: string; label: string }[];
        required: boolean;
        sort_order: number;
      }>;
    };

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "Title is required" }, { status: 400 });
    }
    if (!jd_raw?.trim()) {
      return NextResponse.json({ success: false, error: "Job description is required" }, { status: 400 });
    }

    const requirementId = uuidv4();
    const slug = generateJobSlug(title);

    const defaultQuestions: RequirementQuestion[] = [
      {
        id: uuidv4(),
        requirement_id: requirementId,
        question_text: "Are you open to contract/freelance arrangements?",
        question_type: "boolean",
        required: true,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        requirement_id: requirementId,
        question_text: "What is your current notice period?",
        question_type: "select",
        options: [
          { value: "immediate", label: "Immediate" },
          { value: "15_days", label: "15 days" },
          { value: "30_days", label: "30 days" },
          { value: "60_days", label: "60 days" },
          { value: "90_days", label: "90 days" },
          { value: "other", label: "Other" },
        ],
        required: true,
        sort_order: 2,
        created_at: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        requirement_id: requirementId,
        question_text: "What is your location/remote preference?",
        question_type: "text",
        required: true,
        sort_order: 3,
        created_at: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        requirement_id: requirementId,
        question_text: "What is your expected rate? (optional)",
        question_type: "text",
        required: false,
        sort_order: 4,
        created_at: new Date().toISOString(),
      },
    ];

    const questionsToInsert =
      screening_questions !== undefined
        ? screening_questions.map((q, i) => ({
            id: uuidv4(),
            requirement_id: requirementId,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options || null,
            required: q.required,
            sort_order: q.sort_order ?? i + 1,
            created_at: new Date().toISOString(),
          }))
        : defaultQuestions;

    const requirement = await transaction(async (client) => {
      const reqResult = await client.query(
        `INSERT INTO requirements (
           id, client_id, title, jd_raw, engagement_type, work_mode, location,
           budget_min, budget_max, budget_currency, budget_period,
           status, public_slug, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12,$13)
         RETURNING *`,
        [
          requirementId,
          client_id || null,
          title.trim(),
          jd_raw.trim(),
          engagement_type,
          work_mode || null,
          location || null,
          budget_min || null,
          budget_max || null,
          budget_currency,
          budget_period,
          slug,
          session.userId,
        ]
      );

      for (const q of questionsToInsert) {
        await client.query(
          `INSERT INTO requirement_questions (id, requirement_id, question_text, question_type, options, required, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            q.id,
            q.requirement_id,
            q.question_text,
            q.question_type,
            q.options ? JSON.stringify(q.options) : null,
            q.required,
            q.sort_order,
          ]
        );
      }

      return reqResult.rows[0] as Requirement;
    });

    // Async: extract JD requirements, generate embedding, enqueue match
    Promise.all([
      extractJDRequirements(jd_raw)
        .then(async (parsed) => {
          await query(
            `UPDATE requirements SET parsed_requirements_json = $1, required_skills = $2, min_experience = $3
             WHERE id = $4`,
            [
              JSON.stringify(parsed),
              JSON.stringify(parsed.required_skills),
              parsed.min_experience_years || null,
              requirementId,
            ]
          );
        })
        .catch((err) => console.error("[requirements] JD extraction failed:", err)),

      generateEmbedding(jd_raw)
        .then((embedding) => storeRequirementEmbedding(requirementId, embedding))
        .catch((err) => console.error("[requirements] Embedding failed:", err)),

      enqueueMatch({ requirementId }).catch((err) =>
        console.error("[requirements] Enqueue match failed:", err)
      ),
    ]);

    await auditLog("requirement.created", {
      session,
      entityType: "requirement",
      entityId: requirementId,
      metadata: { title, slug },
    });

    return NextResponse.json<ApiResponse<Requirement>>(
      { success: true, data: requirement },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/admin/requirements POST]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
