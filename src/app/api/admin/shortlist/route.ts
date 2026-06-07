import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { auditLog } from "@/lib/utils";
import type { ApiResponse } from "@/types";

// POST  — manually add a candidate to the shortlist for a requirement
// DELETE — remove a candidate from the shortlist (manual entries only)
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { requirementId, candidateId } = await req.json() as {
      requirementId: string;
      candidateId: string;
    };

    if (!requirementId || !candidateId) {
      return NextResponse.json(
        { success: false, error: "requirementId and candidateId are required" },
        { status: 400 }
      );
    }

    // Verify both exist
    const [req_, cand] = await Promise.all([
      queryOne<{ id: string }>("SELECT id FROM requirements WHERE id = $1", [requirementId]),
      queryOne<{ id: string }>("SELECT id FROM candidates WHERE id = $1 AND status != 'deleted'", [candidateId]),
    ]);

    if (!req_) return NextResponse.json({ success: false, error: "Requirement not found" }, { status: 404 });
    if (!cand) return NextResponse.json({ success: false, error: "Candidate not found" }, { status: 404 });

    await query(
      `INSERT INTO matches
         (id, requirement_id, candidate_id, score, rationale, is_manual, manually_added_at, manually_added_by, generated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, 'Manually shortlisted by recruiter', TRUE, NOW(), $3, NOW())
       ON CONFLICT (requirement_id, candidate_id) DO UPDATE SET
         is_manual = TRUE,
         manually_added_at = NOW(),
         manually_added_by = $3,
         rationale = COALESCE(EXCLUDED.rationale, matches.rationale)`,
      [requirementId, candidateId, session.userId]
    );

    auditLog("shortlist.manual_add", {
      session,
      entityType: "requirement",
      entityId: requirementId,
      metadata: { candidateId },
    });

    return NextResponse.json<ApiResponse<{ added: true }>>({
      success: true,
      data: { added: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { requirementId, candidateId } = await req.json() as {
      requirementId: string;
      candidateId: string;
    };

    if (!requirementId || !candidateId) {
      return NextResponse.json(
        { success: false, error: "requirementId and candidateId are required" },
        { status: 400 }
      );
    }

    await query(
      "DELETE FROM matches WHERE requirement_id = $1 AND candidate_id = $2",
      [requirementId, candidateId]
    );

    auditLog("shortlist.remove", {
      session,
      entityType: "requirement",
      entityId: requirementId,
      metadata: { candidateId },
    });

    return NextResponse.json<ApiResponse<{ removed: true }>>({
      success: true,
      data: { removed: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
