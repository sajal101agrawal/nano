import { NextRequest, NextResponse } from "next/server";
import { getStaffingSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  try {
    const session = await getStaffingSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const search = searchParams.get("search")?.trim() || "";
    const availability = searchParams.get("availability") || "";
    const status = searchParams.get("status") || "active";

    const conditions: string[] = ["sr.company_id = $1", "sr.status != 'deleted'"];
    const params: unknown[] = [session.companyId];

    if (status && status !== "all") {
      params.push(status);
      conditions.push(`sr.status = $${params.length}`);
    }

    if (availability) {
      params.push(availability);
      conditions.push(`sr.availability_status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(sr.full_name ILIKE $${params.length} OR sr.current_title ILIKE $${params.length} OR sr.email ILIKE $${params.length} OR $${params.length - 1} = ANY(sr.skills))`
      );
    }

    const where = conditions.join(" AND ");

    const [resources, countResult] = await Promise.all([
      query<{
        id: string; full_name: string | null; email: string | null; current_title: string | null;
        current_company: string | null; total_experience_years: number | null; availability_status: string;
        skills: string[] | null; location: string | null; status: string; created_at: string; updated_at: string;
        profile_parse_status: string | null;
      }>(
        `SELECT sr.id, sr.full_name, sr.email, sr.current_title, sr.current_company,
                sr.total_experience_years, sr.availability_status, sr.skills, sr.location,
                sr.status, sr.created_at, sr.updated_at,
                srp.parse_status AS profile_parse_status
         FROM staffing_resources sr
         LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
         WHERE ${where}
         ORDER BY sr.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM staffing_resources sr WHERE ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult?.count || "0");

    return NextResponse.json({
      success: true,
      data: resources,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[staffing/resources GET] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getStaffingSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      full_name, email, phone, current_title, current_company,
      total_experience_years, location, work_mode, skills,
      availability_status, expected_rate, rate_currency,
      notice_period_days, notes,
    } = body as {
      full_name?: string; email?: string; phone?: string; current_title?: string;
      current_company?: string; total_experience_years?: number; location?: string;
      work_mode?: string; skills?: string[]; availability_status?: string;
      expected_rate?: string; rate_currency?: string; notice_period_days?: number; notes?: string;
    };

    if (!full_name?.trim()) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    const validAvailability = ["available", "unavailable", "unknown"];
    const avail = availability_status && validAvailability.includes(availability_status)
      ? availability_status
      : "unknown";

    const resourceId = uuidv4();
    await query(
      `INSERT INTO staffing_resources (
         id, company_id, added_by, full_name, email, phone, current_title, current_company,
         total_experience_years, location, work_mode, skills, availability_status,
         expected_rate, rate_currency, notice_period_days, notes, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active',NOW(),NOW())`,
      [
        resourceId, session.companyId, session.userId,
        full_name.trim(), email?.trim() || null, phone?.trim() || null,
        current_title?.trim() || null, current_company?.trim() || null,
        total_experience_years || null, location?.trim() || null, work_mode?.trim() || null,
        skills?.length ? skills : null, avail,
        expected_rate?.trim() || null, rate_currency || "USD",
        notice_period_days || null, notes?.trim() || null,
      ]
    );

    const resource = await queryOne("SELECT * FROM staffing_resources WHERE id = $1", [resourceId]);

    return NextResponse.json({ success: true, data: resource }, { status: 201 });
  } catch (err) {
    console.error("[staffing/resources POST] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
