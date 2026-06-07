import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    await query(
      "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
      [name.trim(), session.userId]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settings/profile]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
