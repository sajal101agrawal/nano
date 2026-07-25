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

  try {
    const body = await req.json() as { completed?: boolean; due_at?: string; note?: string };

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.completed === true) { updates.push("completed_at = NOW()"); }
    if (body.completed === false) { updates.push("completed_at = NULL"); }
    if (body.due_at !== undefined) { values.push(body.due_at); updates.push(`due_at = $${values.length}`); }
    if (body.note !== undefined) { values.push(body.note); updates.push(`note = $${values.length}`); }

    if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    values.push(id);
    await query(`UPDATE follow_up_reminders SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reminders/id PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await query("DELETE FROM follow_up_reminders WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reminders/id DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
