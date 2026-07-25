import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { FollowUpReminder, ApiResponse, PaginatedResult } from "@/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const assignedToMe = searchParams.get("mine") === "true";
    const overdue = searchParams.get("overdue") === "true";
    const completed = searchParams.get("completed") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (assignedToMe) {
      params.push(session.userId);
      conditions.push(`(r.assigned_to = $${params.length} OR r.created_by = $${params.length})`);
    }

    if (overdue) {
      conditions.push("r.due_at < NOW() AND r.completed_at IS NULL");
    } else if (!completed) {
      conditions.push("r.completed_at IS NULL");
    } else {
      conditions.push("r.completed_at IS NOT NULL");
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [{ total }] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM follow_up_reminders r ${where}`,
      params
    );

    params.push(limit, offset);
    const rows = await query<FollowUpReminder & {
      candidate_name: string | null;
      requirement_title: string | null;
      assignee_name: string | null;
    }>(
      `SELECT r.*,
              c.full_name AS candidate_name,
              req.title AS requirement_title,
              u.name AS assignee_name
       FROM follow_up_reminders r
       LEFT JOIN candidates c ON c.id = r.candidate_id
       LEFT JOIN requirements req ON req.id = r.requirement_id
       LEFT JOIN users u ON u.id = r.assigned_to
       ${where}
       ORDER BY r.due_at ASC
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
    console.error("[reminders GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      candidate_id: string;
      application_id?: string;
      requirement_id?: string;
      assigned_to?: string;
      note?: string;
      due_at: string;
    };

    if (!body.candidate_id) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });
    if (!body.due_at) return NextResponse.json({ error: "due_at required" }, { status: 400 });

    const [row] = await query<FollowUpReminder>(
      `INSERT INTO follow_up_reminders
         (id, candidate_id, application_id, requirement_id, created_by, assigned_to, note, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        uuidv4(),
        body.candidate_id,
        body.application_id || null,
        body.requirement_id || null,
        session.userId,
        body.assigned_to || session.userId,
        body.note || null,
        body.due_at,
      ]
    );

    return NextResponse.json<ApiResponse<FollowUpReminder>>({ success: true, data: row }, { status: 201 });
  } catch (err) {
    console.error("[reminders POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
