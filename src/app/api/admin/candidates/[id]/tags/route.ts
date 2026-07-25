import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { CandidateTag, ApiResponse } from "@/types";

const TAG_COLORS = ["blue", "green", "amber", "red", "purple", "pink", "gray", "cyan", "orange"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query<CandidateTag>(
      `SELECT * FROM candidate_tags WHERE candidate_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    return NextResponse.json<ApiResponse<CandidateTag[]>>({ success: true, data: rows });
  } catch (err) {
    console.error("[tags GET]", err);
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
    const body = await req.json() as { tag: string; color?: string };

    if (!body.tag?.trim()) {
      return NextResponse.json({ error: "Tag is required" }, { status: 400 });
    }

    const tag = body.tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 50);
    const color = TAG_COLORS.includes(body.color || "") ? body.color : "blue";

    const [row] = await query<CandidateTag>(
      `INSERT INTO candidate_tags (id, candidate_id, tag, color, created_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (candidate_id, tag) DO UPDATE SET color = EXCLUDED.color
       RETURNING *`,
      [uuidv4(), id, tag, color, session.userId]
    );

    return NextResponse.json<ApiResponse<CandidateTag>>({ success: true, data: row }, { status: 201 });
  } catch (err) {
    console.error("[tags POST]", err);
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
    const { tag } = await req.json() as { tag: string };
    if (!tag) return NextResponse.json({ error: "tag required" }, { status: 400 });

    await query(
      "DELETE FROM candidate_tags WHERE candidate_id = $1 AND tag = $2",
      [id, tag]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[tags DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
