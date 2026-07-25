import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const VALID_STATUSES = [
  "applied", "parsing", "parsed", "parse_failed", "shortlisted",
  "contacted", "in_discussion", "offered", "placed", "rejected", "withdrawn",
];

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      ids: string[];
      status?: string;
      pipeline_stage_id?: string | null;
      rating?: number | null;
    };

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "ids array required" }, { status: 400 });
    }
    if (body.ids.length > 500) {
      return NextResponse.json({ error: "Cannot update more than 500 at once" }, { status: 400 });
    }

    // Validate inputs
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (body.rating !== undefined && body.rating !== null && (body.rating < 1 || body.rating > 5)) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.status !== undefined) {
      values.push(body.status);
      updates.push(`status = $${values.length}`);
    }
    if (body.pipeline_stage_id !== undefined) {
      values.push(body.pipeline_stage_id);
      updates.push(`pipeline_stage_id = $${values.length}`);
    }
    if (body.rating !== undefined) {
      values.push(body.rating);
      updates.push(`rating = $${values.length}`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.push("updated_at = NOW()");

    // Build placeholder list for ids
    const idPlaceholders = body.ids.map((_, i) => `$${values.length + i + 1}`).join(",");
    values.push(...body.ids);

    const affected = await query<{ id: string; requirement_id: string; candidate_id: string; status: string }>(
      `UPDATE applications
       SET ${updates.join(", ")}
       WHERE id IN (${idPlaceholders})
       RETURNING id, requirement_id, candidate_id, status`,
      values
    );

    // Log activity for status changes
    if (body.status !== undefined) {
      const logRows = affected.map((row) => [
        uuidv4(), row.id, row.requirement_id, row.candidate_id,
        session.userId, "status_changed", null, body.status,
      ]);
      for (const row of logRows) {
        await query(
          `INSERT INTO application_activity_log
             (id, application_id, requirement_id, candidate_id, actor_id, action, old_value, new_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          row
        ).catch(() => null);
      }
    }

    return NextResponse.json({ success: true, data: { updated: affected.length } });
  } catch (err) {
    console.error("[applications/bulk PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// GET: export applications as CSV
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const requirementId = searchParams.get("requirement_id");
    const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];

    const conditions: string[] = ["a.id IS NOT NULL"];
    const params: unknown[] = [];

    if (requirementId) {
      params.push(requirementId);
      conditions.push(`a.requirement_id = $${params.length}`);
    }
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${params.length + i + 1}`).join(",");
      params.push(...ids);
      conditions.push(`a.id IN (${placeholders})`);
    }

    const rows = await query<{
      candidate_name: string;
      candidate_email: string;
      requirement_title: string;
      status: string;
      rating: number | null;
      match_score: number | null;
      availability: string;
      location: string | null;
      current_title: string | null;
      experience_years: number | null;
      applied_at: string;
    }>(
      `SELECT
         c.full_name          AS candidate_name,
         c.primary_email      AS candidate_email,
         r.title              AS requirement_title,
         a.status,
         a.rating,
         a.match_score,
         c.availability_status AS availability,
         c.location,
         c.current_title,
         c.total_experience_years AS experience_years,
         a.applied_at
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN requirements r ON r.id = a.requirement_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.applied_at DESC`,
      params
    );

    const headers = [
      "Name", "Email", "Job", "Status", "Rating", "Match Score",
      "Availability", "Location", "Current Title", "Experience (yrs)", "Applied At",
    ];

    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${(r.candidate_name || "").replace(/"/g, '""')}"`,
          `"${(r.candidate_email || "").replace(/"/g, '""')}"`,
          `"${(r.requirement_title || "").replace(/"/g, '""')}"`,
          r.status,
          r.rating ?? "",
          r.match_score != null ? Math.round(r.match_score) : "",
          r.availability,
          `"${(r.location || "").replace(/"/g, '""')}"`,
          `"${(r.current_title || "").replace(/"/g, '""')}"`,
          r.experience_years ?? "",
          new Date(r.applied_at).toISOString().split("T")[0],
        ].join(",")
      ),
    ];

    return new NextResponse(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="applications-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    console.error("[applications/bulk GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
