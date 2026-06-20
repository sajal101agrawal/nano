import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAdminSession } from "@/lib/auth";
import { query, queryOne, transaction } from "@/lib/db";
import { auditLog } from "@/lib/utils";
import { extractJDRequirements } from "@/lib/ai";
import { generateEmbedding, storeRequirementEmbedding } from "@/lib/embeddings";
import type { Requirement, RequirementQuestion, Application, ApiResponse } from "@/types";
import { v4 as uuidv4 } from "uuid";

type RequirementDetail = Requirement & {
  client_name?: string;
  application_count: number;
  questions: RequirementQuestion[];
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    await requireAdminSession();

    const requirement = await queryOne<Requirement & { client_name?: string }>(
      `SELECT r.*, c.company_name AS client_name
       FROM requirements r
       LEFT JOIN clients c ON c.id = r.client_id
       WHERE r.id = $1`,
      [id]
    );

    if (!requirement) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const [questions, countRows] = await Promise.all([
      query<RequirementQuestion>(
        `SELECT * FROM requirement_questions WHERE requirement_id = $1 ORDER BY sort_order`,
        [id]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM applications WHERE requirement_id = $1`,
        [id]
      ),
    ]);

    const detail: RequirementDetail = {
      ...requirement,
      application_count: parseInt(countRows[0]?.count || "0"),
      questions,
    };

    return NextResponse.json<ApiResponse<RequirementDetail>>({ success: true, data: detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/admin/requirements/[id] GET]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const session = await requireAdminSession();
    const body = await req.json() as Partial<{
      title: string;
      jd_raw: string;
      status: string;
      work_mode: string;
      location: string;
      engagement_type: string;
      budget_min: number;
      budget_max: number;
      budget_currency: string;
      budget_period: string;
      client_id: string;
      screening_questions: Array<{
        question_text: string;
        question_type: string;
        options?: { value: string; label: string }[];
        required: boolean;
        sort_order: number;
      }>;
    }>;

    const existing = await queryOne<Requirement>(
      "SELECT * FROM requirements WHERE id = $1",
      [id]
    );

    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const { screening_questions, ...requirementFields } = body;

    const setClauses: string[] = [];
    const values: unknown[] = [];

    const allowedFields: (keyof typeof requirementFields)[] = [
      "title", "jd_raw", "status", "work_mode", "location",
      "engagement_type", "budget_min", "budget_max", "budget_currency",
      "budget_period", "client_id",
    ];

    for (const field of allowedFields) {
      if (requirementFields[field] !== undefined) {
        values.push(requirementFields[field]);
        setClauses.push(`${field} = $${values.length}`);
      }
    }

    const hasRequirementUpdates = setClauses.length > 0;
    const hasQuestionUpdates = screening_questions !== undefined;

    if (!hasRequirementUpdates && !hasQuestionUpdates) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    let updated: Requirement | null = existing;

    if (hasRequirementUpdates || hasQuestionUpdates) {
      updated = await transaction(async (client) => {
        let requirementRow = existing;

        if (hasRequirementUpdates) {
          values.push(new Date().toISOString(), id);
          setClauses.push(`updated_at = $${values.length - 1}`);

          const reqResult = await client.query<Requirement>(
            `UPDATE requirements SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
            values
          );
          requirementRow = reqResult.rows[0];
        }

        if (hasQuestionUpdates) {
          await client.query(
            "DELETE FROM requirement_questions WHERE requirement_id = $1",
            [id]
          );

          for (const [i, q] of screening_questions!.entries()) {
            await client.query(
              `INSERT INTO requirement_questions (id, requirement_id, question_text, question_type, options, required, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [
                uuidv4(),
                id,
                q.question_text,
                q.question_type,
                q.options ? JSON.stringify(q.options) : null,
                q.required,
                q.sort_order ?? i + 1,
              ]
            );
          }

          if (!hasRequirementUpdates) {
            const reqResult = await client.query<Requirement>(
              "UPDATE requirements SET updated_at = $1 WHERE id = $2 RETURNING *",
              [new Date().toISOString(), id]
            );
            requirementRow = reqResult.rows[0];
          }
        }

        return requirementRow;
      });
    }

    // If JD changed, re-extract and re-embed asynchronously
    if (requirementFields.jd_raw && requirementFields.jd_raw !== existing.jd_raw) {
      Promise.all([
        extractJDRequirements(requirementFields.jd_raw)
          .then(async (parsed) => {
            await query(
              `UPDATE requirements SET parsed_requirements_json = $1, required_skills = $2, min_experience = $3 WHERE id = $4`,
              [JSON.stringify(parsed), JSON.stringify(parsed.required_skills), parsed.min_experience_years || null, id]
            );
          })
          .catch(console.error),
        generateEmbedding(requirementFields.jd_raw)
          .then((emb) => storeRequirementEmbedding(id, emb))
          .catch(console.error),
      ]);
    }

    await auditLog("requirement.updated", {
      session,
      entityType: "requirement",
      entityId: id,
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json<ApiResponse<Requirement>>({ success: true, data: updated! });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/admin/requirements/[id] PATCH]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const existing = await queryOne<{ id: string; title: string }>(
      "SELECT id, title FROM requirements WHERE id = $1",
      [id]
    );
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Hard delete — cascades to applications, answers, matches via FK
    await query("DELETE FROM requirements WHERE id = $1", [id]);

    await auditLog("requirement.deleted", {
      session,
      entityType: "requirement",
      entityId: id,
      metadata: { title: existing.title },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[api/admin/requirements/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
