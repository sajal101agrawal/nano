import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

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
      conditions.push(`(sc.name ILIKE $${params.length} OR sc.domain ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [companies, countRow] = await Promise.all([
      query<{
        id: string; name: string; domain: string | null; verified: boolean;
        website: string | null; industry: string | null; created_at: string;
        user_count: string; resource_count: string;
      }>(
        `SELECT sc.id, sc.name, sc.domain, sc.verified, sc.website, sc.industry, sc.created_at,
                COUNT(DISTINCT su.id) AS user_count,
                COUNT(DISTINCT sr.id) AS resource_count
         FROM staffing_companies sc
         LEFT JOIN staffing_users su ON su.company_id = sc.id
         LEFT JOIN staffing_resources sr ON sr.company_id = sc.id AND sr.status != 'deleted'
         ${where}
         GROUP BY sc.id
         ORDER BY sc.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM staffing_companies sc ${where}`,
        params
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: companies,
      total: parseInt(countRow?.count || "0"),
      page,
      limit,
    });
  } catch (err) {
    console.error("[admin/staffing/companies GET]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, domain, website, industry, notes, verified } = body as {
      name?: string; domain?: string; website?: string; industry?: string; notes?: string; verified?: boolean;
    };

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "Company name is required" }, { status: 400 });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO staffing_companies (id, name, domain, website, industry, notes, verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [id, name.trim(), domain?.trim() || null, website?.trim() || null, industry?.trim() || null, notes?.trim() || null, verified ?? false]
    );

    const company = await queryOne("SELECT * FROM staffing_companies WHERE id = $1", [id]);
    return NextResponse.json({ success: true, data: company }, { status: 201 });
  } catch (err) {
    console.error("[admin/staffing/companies POST]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
