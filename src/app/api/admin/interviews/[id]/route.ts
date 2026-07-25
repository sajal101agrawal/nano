import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import type { Interview, ApiResponse } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [interview] = await query<Interview & { candidate_name: string; requirement_title: string }>(
      `SELECT i.*,
              c.full_name AS candidate_name,
              r.title AS requirement_title
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN requirements r ON r.id = i.requirement_id
       WHERE i.id = $1`,
      [id]
    );
    if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const interviewers = await query<{ user_id: string; user_name: string | null; response_status: string }>(
      `SELECT ii.user_id, u.name AS user_name, ii.response_status
       FROM interview_interviewers ii
       LEFT JOIN users u ON u.id = ii.user_id
       WHERE ii.interview_id = $1`,
      [id]
    );

    const scorecards = await query<Record<string, unknown>>(
      `SELECT isc.*, u.name AS interviewer_name
       FROM interview_scorecards isc
       LEFT JOIN users u ON u.id = isc.interviewer_id
       WHERE isc.interview_id = $1`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: { ...interview, interviewers, scorecards },
    });
  } catch (err) {
    console.error("[interviews/id GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      status?: string;
      scheduled_at?: string | null;
      duration_minutes?: number;
      location?: string | null;
      notes?: string | null;
      interviewer_ids?: string[];
    };

    const VALID_STATUSES = ["scheduled", "completed", "cancelled", "no_show"];

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      values.push(body.status); updates.push(`status = $${values.length}`);
    }
    if (body.scheduled_at !== undefined) { values.push(body.scheduled_at); updates.push(`scheduled_at = $${values.length}`); }
    if (body.duration_minutes !== undefined) { values.push(body.duration_minutes); updates.push(`duration_minutes = $${values.length}`); }
    if (body.location !== undefined) { values.push(body.location); updates.push(`location = $${values.length}`); }
    if (body.notes !== undefined) { values.push(body.notes); updates.push(`notes = $${values.length}`); }

    if (updates.length > 0) {
      updates.push("updated_at = NOW()");
      values.push(id);
      await query(`UPDATE interviews SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
    }

    if (Array.isArray(body.interviewer_ids)) {
      await query("DELETE FROM interview_interviewers WHERE interview_id = $1", [id]);
      const { v4: uuidv4 } = await import("uuid");
      for (const userId of body.interviewer_ids) {
        await query(
          "INSERT INTO interview_interviewers (id, interview_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          [uuidv4(), id, userId]
        ).catch(() => null);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[interviews/id PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await query("DELETE FROM interviews WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[interviews/id DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
