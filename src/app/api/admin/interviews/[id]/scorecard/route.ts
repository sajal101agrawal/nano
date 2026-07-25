import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { InterviewScorecard, ApiResponse } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query<InterviewScorecard & { interviewer_name: string | null }>(
      `SELECT isc.*, u.name AS interviewer_name
       FROM interview_scorecards isc
       LEFT JOIN users u ON u.id = isc.interviewer_id
       WHERE isc.interview_id = $1
       ORDER BY isc.submitted_at ASC`,
      [id]
    );
    return NextResponse.json<ApiResponse<typeof rows>>({ success: true, data: rows });
  } catch (err) {
    console.error("[scorecard GET]", err);
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
      criteria_json?: Array<{ name: string; rating: number; comment?: string }>;
      overall_rating?: number;
      recommendation?: string;
      notes?: string;
    };

    const VALID_RECS = ["strong_yes", "yes", "maybe", "no", "strong_no"];
    if (body.recommendation && !VALID_RECS.includes(body.recommendation)) {
      return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
    }

    const [row] = await query<InterviewScorecard>(
      `INSERT INTO interview_scorecards
         (id, interview_id, interviewer_id, criteria_json, overall_rating, recommendation, notes, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (interview_id, interviewer_id)
       DO UPDATE SET
         criteria_json = EXCLUDED.criteria_json,
         overall_rating = EXCLUDED.overall_rating,
         recommendation = EXCLUDED.recommendation,
         notes = EXCLUDED.notes,
         submitted_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        uuidv4(), id, session.userId,
        body.criteria_json ? JSON.stringify(body.criteria_json) : null,
        body.overall_rating || null,
        body.recommendation || null,
        body.notes || null,
      ]
    );

    return NextResponse.json<ApiResponse<InterviewScorecard>>({ success: true, data: row }, { status: 201 });
  } catch (err) {
    console.error("[scorecard POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
