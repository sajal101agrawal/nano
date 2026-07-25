import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { CandidateNote, ApiResponse, PaginatedResult } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const applicationId = searchParams.get("application_id");

    const conditions: string[] = ["n.candidate_id = $1"];
    const queryParams: unknown[] = [id];

    // Only show team notes + own private notes
    conditions.push(`(n.visibility = 'team' OR n.author_id = $2)`);
    queryParams.push(session.userId);

    if (applicationId) {
      queryParams.push(applicationId);
      conditions.push(`n.application_id = $${queryParams.length}`);
    }

    const rows = await query<CandidateNote & { author_name: string | null }>(
      `SELECT n.*, u.name AS author_name
       FROM candidate_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY n.pinned DESC, n.created_at DESC`,
      queryParams
    );

    return NextResponse.json<ApiResponse<CandidateNote[]>>({ success: true, data: rows });
  } catch (err) {
    console.error("[notes GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      body: string;
      application_id?: string;
      requirement_id?: string;
      visibility?: "private" | "team";
      pinned?: boolean;
    };

    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Note body is required" }, { status: 400 });
    }

    const noteId = uuidv4();
    const [note] = await query<CandidateNote>(
      `INSERT INTO candidate_notes
         (id, candidate_id, application_id, requirement_id, author_id, body, visibility, pinned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        noteId,
        id,
        body.application_id || null,
        body.requirement_id || null,
        session.userId,
        body.body.trim(),
        body.visibility || "team",
        body.pinned || false,
      ]
    );

    // Also log as activity if tied to an application
    if (body.application_id) {
      const app = await query<{ requirement_id: string; candidate_id: string }>(
        "SELECT requirement_id, candidate_id FROM applications WHERE id = $1",
        [body.application_id]
      );
      if (app.length) {
        await query(
          `INSERT INTO application_activity_log
             (id, application_id, requirement_id, candidate_id, actor_id, action, note)
           VALUES ($1,$2,$3,$4,$5,'note_added',$6)`,
          [uuidv4(), body.application_id, app[0].requirement_id, app[0].candidate_id, session.userId, body.body.trim().slice(0, 200)]
        ).catch(() => null);
      }
    }

    return NextResponse.json<ApiResponse<CandidateNote>>({ success: true, data: note }, { status: 201 });
  } catch (err) {
    console.error("[notes POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
