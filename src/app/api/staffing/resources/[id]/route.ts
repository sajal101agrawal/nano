import { NextRequest, NextResponse } from "next/server";
import { getStaffingSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getStaffingSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const resource = await queryOne<{ id: string; company_id: string }>(
      `SELECT sr.*, srp.raw_cv_url, srp.raw_cv_filename, srp.parsed_json, srp.summary,
              srp.parse_status AS profile_parse_status, srp.parse_error AS profile_parse_error,
              srp.id AS profile_id
       FROM staffing_resources sr
       LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
       WHERE sr.id = $1 AND sr.status != 'deleted'`,
      [id]
    );

    if (!resource || resource.company_id !== session.companyId) {
      return NextResponse.json({ success: false, error: "Resource not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: resource });
  } catch (err) {
    console.error("[staffing/resources/[id] GET] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getStaffingSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await queryOne<{ id: string; company_id: string }>(
      "SELECT id, company_id FROM staffing_resources WHERE id = $1 AND status != 'deleted'",
      [id]
    );

    if (!existing || existing.company_id !== session.companyId) {
      return NextResponse.json({ success: false, error: "Resource not found" }, { status: 404 });
    }

    const body = await req.json();
    const allowed = [
      "full_name", "email", "phone", "current_title", "current_company",
      "total_experience_years", "location", "work_mode", "skills",
      "availability_status", "expected_rate", "rate_currency",
      "notice_period_days", "notes", "status",
    ];

    const updates: string[] = [];
    const vals: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        vals.push(body[key]);
        updates.push(`${key} = $${vals.length}`);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    vals.push(id);
    await query(
      `UPDATE staffing_resources SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`,
      vals
    );

    const updated = await queryOne("SELECT * FROM staffing_resources WHERE id = $1", [id]);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[staffing/resources/[id] PATCH] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getStaffingSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await queryOne<{ id: string; company_id: string }>(
      "SELECT id, company_id FROM staffing_resources WHERE id = $1 AND status != 'deleted'",
      [id]
    );

    if (!existing || existing.company_id !== session.companyId) {
      return NextResponse.json({ success: false, error: "Resource not found" }, { status: 404 });
    }

    await query(
      "UPDATE staffing_resources SET status = 'deleted', updated_at = NOW() WHERE id = $1",
      [id]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staffing/resources/[id] DELETE] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
