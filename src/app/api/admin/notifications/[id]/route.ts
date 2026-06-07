import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await query(
    "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2",
    [id, session.userId]
  );

  return NextResponse.json({ success: true });
}
