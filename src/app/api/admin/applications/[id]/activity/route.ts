import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query<{
      id: string;
      action: string;
      old_value: string | null;
      new_value: string | null;
      note: string | null;
      actor_name: string | null;
      created_at: string;
    }>(
      `SELECT al.id, al.action, al.old_value, al.new_value, al.note,
              u.name AS actor_name, al.created_at
       FROM application_activity_log al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.application_id = $1
       ORDER BY al.created_at DESC`,
      [id]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error("[applications/activity GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
