import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { enqueueMatch, matchQueue } from "@/lib/queue";
import { auditLog } from "@/lib/utils";
import type { Requirement, ApiResponse } from "@/types";

/** Returns whether a match job is currently waiting or active for this requirement */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    await requireAdminSession();

    const jobId = `match-${id}`;
    const job = await matchQueue.getJob(jobId);

    let queued = false;
    if (job) {
      const state = await job.getState();
      queued = state === "waiting" || state === "active" || state === "delayed";
    }

    return NextResponse.json<ApiResponse<{ queued: boolean }>>({
      success: true,
      data: { queued },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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

    // Check if already queued/active — prevent duplicate jobs
    const jobId = `match-${id}`;
    const existing = await matchQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "waiting" || state === "active" || state === "delayed") {
        return NextResponse.json<ApiResponse<{ jobId: string }>>({
          success: true,
          data: { jobId },
          message: "Match job already in queue",
        });
      }
      // Remove stale completed/failed job so the new one isn't blocked
      await existing.remove();
    }

    const newJobId = await enqueueMatch({ requirementId: id, topN: 50 });

    await auditLog("requirement.match_triggered", {
      session,
      entityType: "requirement",
      entityId: id,
      metadata: { jobId: newJobId },
    });

    return NextResponse.json<ApiResponse<{ jobId: string }>>({
      success: true,
      data: { jobId: newJobId },
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
