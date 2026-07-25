import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { ApiResponse } from "@/types";

type Member = {
  id: string;
  candidate_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_headline: string | null;
  availability_status: string;
  notes: string | null;
  added_at: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query<Member>(
      `SELECT tpm.id, tpm.candidate_id, tpm.notes, tpm.added_at,
              c.full_name AS candidate_name,
              c.primary_email AS candidate_email,
              c.headline AS candidate_headline,
              c.availability_status
       FROM talent_pool_members tpm
       JOIN candidates c ON c.id = tpm.candidate_id
       WHERE tpm.pool_id = $1
       ORDER BY tpm.added_at DESC`,
      [id]
    );
    return NextResponse.json<ApiResponse<Member[]>>({ success: true, data: rows });
  } catch (err) {
    console.error("[pool-members GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as { candidate_id: string; notes?: string } | { candidate_ids: string[] };

    const candidateIds = "candidate_ids" in body ? body.candidate_ids : [body.candidate_id];
    if (!candidateIds.length) return NextResponse.json({ error: "candidate_id(s) required" }, { status: 400 });

    for (const cid of candidateIds) {
      await query(
        `INSERT INTO talent_pool_members (id, pool_id, candidate_id, added_by)
         VALUES ($1,$2,$3,$4) ON CONFLICT (pool_id, candidate_id) DO NOTHING`,
        [uuidv4(), id, cid, session.userId]
      ).catch(() => null);
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[pool-members POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { candidate_id } = await req.json() as { candidate_id: string };
    if (!candidate_id) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });

    await query(
      "DELETE FROM talent_pool_members WHERE pool_id = $1 AND candidate_id = $2",
      [id, candidate_id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pool-members DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
