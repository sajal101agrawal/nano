import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { TalentPool, ApiResponse, PaginatedResult } from "@/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query<TalentPool & { member_count: string }>(
      `SELECT tp.*, COUNT(tpm.id)::text AS member_count
       FROM talent_pools tp
       LEFT JOIN talent_pool_members tpm ON tpm.pool_id = tp.id
       GROUP BY tp.id
       ORDER BY tp.created_at DESC`
    );

    const data = rows.map((r) => ({ ...r, member_count: parseInt(r.member_count || "0") }));
    return NextResponse.json<ApiResponse<TalentPool[]>>({ success: true, data });
  } catch (err) {
    console.error("[talent-pools GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as { name: string; description?: string };
    if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const [pool] = await query<TalentPool>(
      `INSERT INTO talent_pools (id, name, description, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uuidv4(), body.name.trim(), body.description || null, session.userId]
    );
    return NextResponse.json<ApiResponse<TalentPool>>({ success: true, data: pool }, { status: 201 });
  } catch (err) {
    console.error("[talent-pools POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
