import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const users = await query(
      `SELECT id, name, email, designation, status, last_login_at, created_at
       FROM staffing_users WHERE company_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    return NextResponse.json({ success: true, data: users });
  } catch (err) {
    console.error("[admin/staffing/companies/[id]/users GET]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
