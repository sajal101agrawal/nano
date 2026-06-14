import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";

    if (q.length < 1) {
      return NextResponse.json({ success: true, data: [] });
    }

    const companies = await query<{ id: string; name: string; domain: string | null }>(
      `SELECT id, name, domain
       FROM staffing_companies
       WHERE name ILIKE $1
       ORDER BY name ASC
       LIMIT 10`,
      [`%${q}%`]
    );

    return NextResponse.json({ success: true, data: companies });
  } catch (err) {
    console.error("[staffing/companies] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
