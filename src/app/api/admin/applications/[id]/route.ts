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
    const { status } = await req.json();

    const validStatuses = [
      "applied", "parsing", "parsed", "parse_failed", "shortlisted",
      "contacted", "in_discussion", "offered", "placed", "rejected", "withdrawn",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await query(
      "UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, id]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[applications/update]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
