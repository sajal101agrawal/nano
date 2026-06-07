import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const read = url.searchParams.get("read");
  const offset = (page - 1) * limit;

  let whereClause = `WHERE user_id = $1`;
  const params: unknown[] = [session.userId];

  if (read === "false") {
    whereClause += " AND read = FALSE";
  }

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT id, type, title, body, entity_type, entity_id, read, created_at
       FROM notifications ${whereClause}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM notifications ${whereClause}`,
      params
    ),
  ]);

  return NextResponse.json({
    notifications: rows,
    total: parseInt(countRows[0]?.count || "0"),
    page,
    limit,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, all } = await req.json();

  if (all) {
    await query(
      "UPDATE notifications SET read = TRUE WHERE user_id = $1",
      [session.userId]
    );
  } else if (ids?.length > 0) {
    const placeholders = ids.map((_: unknown, i: number) => `$${i + 2}`).join(", ");
    await query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id IN (${placeholders})`,
      [session.userId, ...ids]
    );
  }

  return NextResponse.json({ success: true });
}
