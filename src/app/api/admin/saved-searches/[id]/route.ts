import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await query(
      "DELETE FROM saved_searches WHERE id = $1 AND user_id = $2",
      [id, session.userId]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[saved-searches/id DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as { name?: string; notify_on_new_match?: boolean; query_params_json?: Record<string, unknown> };

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) { values.push(body.name); updates.push(`name = $${values.length}`); }
    if (body.notify_on_new_match !== undefined) { values.push(body.notify_on_new_match); updates.push(`notify_on_new_match = $${values.length}`); }
    if (body.query_params_json !== undefined) { values.push(JSON.stringify(body.query_params_json)); updates.push(`query_params_json = $${values.length}`); }

    if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    updates.push("updated_at = NOW()");
    values.push(id, session.userId);
    await query(
      `UPDATE saved_searches SET ${updates.join(", ")} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[saved-searches/id PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
