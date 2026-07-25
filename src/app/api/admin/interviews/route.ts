import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { Interview, ApiResponse, PaginatedResult } from "@/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const requirementId = searchParams.get("requirement_id");
    const applicationId = searchParams.get("application_id");
    const candidateId = searchParams.get("candidate_id");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (requirementId) { params.push(requirementId); conditions.push(`i.requirement_id = $${params.length}`); }
    if (applicationId) { params.push(applicationId); conditions.push(`i.application_id = $${params.length}`); }
    if (candidateId) { params.push(candidateId); conditions.push(`i.candidate_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countParams = [...params];
    const [{ total }] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM interviews i ${where}`,
      countParams
    );

    params.push(limit, offset);
    const rows = await query<Interview & {
      candidate_name: string;
      requirement_title: string;
      interviewer_names: string;
    }>(
      `SELECT i.*,
              c.full_name AS candidate_name,
              r.title AS requirement_title,
              COALESCE(
                string_agg(u.name, ', ' ORDER BY ii.created_at),
                ''
              ) AS interviewer_names
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN requirements r ON r.id = i.requirement_id
       LEFT JOIN interview_interviewers ii ON ii.interview_id = i.id
       LEFT JOIN users u ON u.id = ii.user_id
       ${where}
       GROUP BY i.id, c.full_name, r.title
       ORDER BY i.scheduled_at ASC NULLS LAST, i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return NextResponse.json<ApiResponse<PaginatedResult<typeof rows[0]>>>({
      success: true,
      data: {
        data: rows,
        total: parseInt(total),
        page,
        limit,
        totalPages: Math.ceil(parseInt(total) / limit),
      },
    });
  } catch (err) {
    console.error("[interviews GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      application_id: string;
      interview_type?: string;
      round_number?: number;
      scheduled_at?: string;
      duration_minutes?: number;
      location?: string;
      notes?: string;
      interviewer_ids?: string[];
    };

    if (!body.application_id) {
      return NextResponse.json({ error: "application_id is required" }, { status: 400 });
    }

    // Get application details
    const [app] = await query<{ requirement_id: string; candidate_id: string }>(
      "SELECT requirement_id, candidate_id FROM applications WHERE id = $1",
      [body.application_id]
    );
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const interviewId = uuidv4();
    const [interview] = await query<Interview>(
      `INSERT INTO interviews
         (id, application_id, requirement_id, candidate_id, interview_type, round_number,
          scheduled_at, duration_minutes, location, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',$10,$11)
       RETURNING *`,
      [
        interviewId,
        body.application_id,
        app.requirement_id,
        app.candidate_id,
        body.interview_type || "video",
        body.round_number || 1,
        body.scheduled_at || null,
        body.duration_minutes || 60,
        body.location || null,
        body.notes || null,
        session.userId,
      ]
    );

    // Add interviewers
    if (Array.isArray(body.interviewer_ids)) {
      for (const userId of body.interviewer_ids) {
        await query(
          `INSERT INTO interview_interviewers (id, interview_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [uuidv4(), interviewId, userId]
        ).catch(() => null);
      }
    }

    // Log activity
    await query(
      `INSERT INTO application_activity_log
         (id, application_id, requirement_id, candidate_id, actor_id, action, new_value)
       VALUES ($1,$2,$3,$4,$5,'interview_scheduled',$6)`,
      [
        uuidv4(), body.application_id, app.requirement_id, app.candidate_id,
        session.userId,
        body.scheduled_at ? new Date(body.scheduled_at).toLocaleDateString() : "TBD",
      ]
    ).catch(() => null);

    // Bump application status to in_discussion if it's earlier in the funnel
    await query(
      `UPDATE applications
       SET status = 'in_discussion', updated_at = NOW()
       WHERE id = $1 AND status IN ('applied','parsing','parsed','shortlisted','contacted')`,
      [body.application_id]
    ).catch(() => null);

    return NextResponse.json<ApiResponse<Interview>>({ success: true, data: interview }, { status: 201 });
  } catch (err) {
    console.error("[interviews POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
