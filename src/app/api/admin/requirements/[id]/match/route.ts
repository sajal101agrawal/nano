import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { enqueueMatch } from "@/lib/queue";
import { auditLog } from "@/lib/utils";
import type { Requirement, ApiResponse } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const session = await requireAdminSession();

    const requirement = await queryOne<Requirement>(
      "SELECT id, status FROM requirements WHERE id = $1",
      [id]
    );

    if (!requirement) {
      return NextResponse.json({ success: false, error: "Requirement not found" }, { status: 404 });
    }

    const jobId = await enqueueMatch({ requirementId: id, topN: 50 });

    await auditLog("requirement.match_triggered", {
      session,
      entityType: "requirement",
      entityId: id,
      metadata: { jobId },
    });

    return NextResponse.json<ApiResponse<{ jobId: string }>>({
      success: true,
      data: { jobId },
      message: "Match job enqueued",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/admin/requirements/[id]/match POST]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
