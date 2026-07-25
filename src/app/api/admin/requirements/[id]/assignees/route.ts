import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ApiResponse } from "@/types";

type AssigneeRow = {
  user_id: string;
  user_name: string | null;
  user_email: string;
  role: string;
  assigned_at: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const assignees = await query<AssigneeRow>(
      `SELECT ja.user_id, u.name AS user_name, u.email AS user_email, ja.role, ja.created_at AS assigned_at
       FROM job_assignments ja
       JOIN users u ON u.id = ja.user_id
       WHERE ja.requirement_id = $1
       ORDER BY ja.created_at ASC`,
      [id]
    );

    return NextResponse.json<ApiResponse<AssigneeRow[]>>({ success: true, data: assignees });
  } catch (err) {
    console.error("[assignees/get]", err);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const body = await req.json() as { user_id?: string; role?: string };
    const userId = body.user_id || session.userId;
    const role = body.role || "recruiter";

    await query(
      `INSERT INTO job_assignments (requirement_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (requirement_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
      [id, userId, role]
    );

    return NextResponse.json<ApiResponse<null>>({ success: true, data: null });
  } catch (err) {
    console.error("[assignees/post]", err);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const body = await req.json() as { user_id?: string };
    const userId = body.user_id || session.userId;

    await query(
      "DELETE FROM job_assignments WHERE requirement_id = $1 AND user_id = $2",
      [id, userId]
    );

    return NextResponse.json<ApiResponse<null>>({ success: true, data: null });
  } catch (err) {
    console.error("[assignees/delete]", err);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: "Failed" }, { status: 500 });
  }
}
