import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { auditLog } from "@/lib/utils";
import { extractJDRequirements } from "@/lib/ai";
import { generateEmbedding, storeRequirementEmbedding } from "@/lib/embeddings";
import type { Requirement, RequirementQuestion, Application, ApiResponse } from "@/types";

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
    }>;

    const existing = await queryOne<Requirement>(
      "SELECT * FROM requirements WHERE id = $1",
      [id]
    );

    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    const allowedFields: (keyof typeof body)[] = [
      "title", "jd_raw", "status", "work_mode", "location",
      "engagement_type", "budget_min", "budget_max", "budget_currency",
      "budget_period", "client_id",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        values.push(body[field]);
        setClauses.push(`${field} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    values.push(new Date().toISOString(), id);
    setClauses.push(`updated_at = $${values.length - 1}`);

    const updated = await queryOne<Requirement>(
      `UPDATE requirements SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    // If JD changed, re-extract and re-embed asynchronously
    if (body.jd_raw && body.jd_raw !== existing.jd_raw) {
      Promise.all([
        extractJDRequirements(body.jd_raw)
          .then(async (parsed) => {
            await query(
              `UPDATE requirements SET parsed_requirements_json = $1, required_skills = $2, min_experience = $3 WHERE id = $4`,
              [JSON.stringify(parsed), JSON.stringify(parsed.required_skills), parsed.min_experience_years || null, id]
            );
          })
          .catch(console.error),
        generateEmbedding(body.jd_raw)
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
