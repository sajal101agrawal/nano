import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const allowed = ["name", "designation", "status"];

    const updates: string[] = [];
    const vals: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        vals.push(body[key]);
        updates.push(`${key} = $${vals.length}`);
      }
    }

    if (!updates.length) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    vals.push(id);
    await query(
      `UPDATE staffing_users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`,
      vals
    );

    const updated = await queryOne("SELECT * FROM staffing_users WHERE id = $1", [id]);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[admin/staffing/users/[id] PATCH]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await query("DELETE FROM staffing_users WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/staffing/users/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
