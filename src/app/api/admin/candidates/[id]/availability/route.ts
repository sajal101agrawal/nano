import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { enqueueAvailabilityCheck } from "@/lib/queue";
import type { ApiResponse } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireAdminSession();

    const candidate = await queryOne<{ id: string }>(
      `SELECT id FROM candidates WHERE id = $1 AND status != 'deleted'`,
      [id]
    );

    if (!candidate) {
      return NextResponse.json({ success: false, error: "Candidate not found" }, { status: 404 });
    }

    await enqueueAvailabilityCheck({
      type: "send_check",
      candidateId: id,
    });

    return NextResponse.json<ApiResponse<{ success: boolean }>>({
      success: true,
      data: { success: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
