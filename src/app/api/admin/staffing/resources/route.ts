import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const availability = searchParams.get("availability") || "";
    const companyId = searchParams.get("company_id") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["sr.status != 'deleted'"];
    const params: unknown[] = [];

    if (companyId) {
      params.push(companyId);
      conditions.push(`sr.company_id = $${params.length}`);
    }

    if (availability) {
      params.push(availability);
      conditions.push(`sr.availability_status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(sr.full_name ILIKE $${params.length} OR sr.current_title ILIKE $${params.length} OR sr.email ILIKE $${params.length})`
      );
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const [resources, countRow] = await Promise.all([
      query(
        `SELECT sr.id, sr.full_name, sr.email, sr.current_title, sr.current_company,
                sr.total_experience_years, sr.availability_status, sr.skills, sr.location,
                sr.status, sr.created_at, sr.updated_at,
                sc.name AS company_name, sc.id AS company_id,
                srp.parse_status AS profile_parse_status, srp.summary
         FROM staffing_resources sr
         JOIN staffing_companies sc ON sc.id = sr.company_id
         LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
         ${where}
         ORDER BY sr.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM staffing_resources sr ${where}`,
        params
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: resources,
      total: parseInt(countRow?.count || "0"),
      page,
      limit,
    });
  } catch (err) {
    console.error("[admin/staffing/resources GET]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
