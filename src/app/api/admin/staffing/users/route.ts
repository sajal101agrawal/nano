import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(su.name ILIKE $${params.length} OR su.email ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [users, countRow] = await Promise.all([
      query(
        `SELECT su.id, su.name, su.email, su.designation, su.status, su.last_login_at, su.created_at,
                sc.name AS company_name, sc.id AS company_id
         FROM staffing_users su
         JOIN staffing_companies sc ON sc.id = su.company_id
         ${where}
         ORDER BY su.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM staffing_users su ${where}`,
        params
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      total: parseInt(countRow?.count || "0"),
      page,
      limit,
    });
  } catch (err) {
    console.error("[admin/staffing/users GET]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
