import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const [company, users, resources] = await Promise.all([
      queryOne(
        `SELECT sc.*, COUNT(DISTINCT su.id) AS user_count, COUNT(DISTINCT sr.id) AS resource_count
         FROM staffing_companies sc
         LEFT JOIN staffing_users su ON su.company_id = sc.id
         LEFT JOIN staffing_resources sr ON sr.company_id = sc.id AND sr.status != 'deleted'
         WHERE sc.id = $1
         GROUP BY sc.id`,
        [id]
      ),
      query(
        `SELECT id, name, email, designation, status, last_login_at, created_at
         FROM staffing_users WHERE company_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      query(
        `SELECT sr.id, sr.full_name, sr.current_title, sr.availability_status, sr.skills,
                sr.total_experience_years, sr.status, sr.created_at,
                srp.parse_status AS profile_parse_status
         FROM staffing_resources sr
         LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
         WHERE sr.company_id = $1 AND sr.status != 'deleted'
         ORDER BY sr.created_at DESC
         LIMIT 50`,
        [id]
      ),
    ]);

    if (!company) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: { ...company, users, resources } });
  } catch (err) {
    console.error("[admin/staffing/companies/[id] GET]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const allowed = ["name", "domain", "website", "industry", "notes", "verified"];

    const updates: string[] = [];
    const vals: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        vals.push(body[key]);
        updates.push(`${key} = $${vals.length}`);
      }
    }

    if (!updates.length) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    vals.push(id);
    await query(
      `UPDATE staffing_companies SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`,
      vals
    );

    const updated = await queryOne("SELECT * FROM staffing_companies WHERE id = $1", [id]);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[admin/staffing/companies/[id] PATCH]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await query("DELETE FROM staffing_companies WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/staffing/companies/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
