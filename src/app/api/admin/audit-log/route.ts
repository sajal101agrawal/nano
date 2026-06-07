import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    query<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata: string;
      ip_address: string;
      created_at: string;
      user_name: string;
    }>(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.metadata, al.ip_address, al.created_at,
              u.name AS user_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ count: string }>("SELECT COUNT(*) as count FROM audit_log"),
  ]);

  return NextResponse.json({
    logs: rows,
    total: parseInt(countRows[0]?.count || "0"),
    page,
    limit,
  });
}
