import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { cvParseQueue } from "@/lib/queue";
import { extractKeyFromUrl } from "@/lib/storage";
import { auditLog } from "@/lib/utils";
import type { ApiResponse, CandidateProfile } from "@/types";

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Fetch current profile + most recent linked application
    const profile = await queryOne<
      Pick<CandidateProfile, "id" | "raw_cv_url" | "raw_cv_filename" | "parse_status"> & {
        application_id: string | null;
      }
    >(
      `SELECT
         cp.id,
         cp.raw_cv_url,
         cp.raw_cv_filename,
         cp.parse_status,
         (SELECT a.id
          FROM applications a
          WHERE a.candidate_id = cp.candidate_id
          ORDER BY a.applied_at DESC
          LIMIT 1) AS application_id
       FROM candidate_profiles cp
       WHERE cp.candidate_id = $1
         AND cp.is_current = TRUE`,
      [id]
    );

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "No profile found for this candidate" },
        { status: 404 }
      );
    }

    if (!profile.raw_cv_url) {
      return NextResponse.json(
        { success: false, error: "No CV file attached to this profile" },
        { status: 400 }
      );
    }

    if (profile.parse_status !== "failed") {
      return NextResponse.json(
        { success: false, error: `Cannot retry — current status is '${profile.parse_status}'` },
        { status: 400 }
      );
    }

    if (!profile.application_id) {
      return NextResponse.json(
        { success: false, error: "No application linked to this profile" },
        { status: 400 }
      );
    }

    const cvKey = extractKeyFromUrl(profile.raw_cv_url);
    const ext = (profile.raw_cv_filename || "").split(".").pop()?.toLowerCase() || "pdf";
    const mimeType = MIME_MAP[ext] || "application/pdf";

    // Remove any stale failed/waiting job with the same ID so BullMQ
    // actually processes the new one instead of deduplicating it.
    const existingJobId = `cv-${profile.id}`;
    const existing = await cvParseQueue.getJob(existingJobId);
    if (existing) {
      await existing.remove();
    }

    // Reset parse status before enqueuing
    await query(
      `UPDATE candidate_profiles
       SET parse_status = 'pending', parse_error = NULL
       WHERE id = $1`,
      [profile.id]
    );

    // Reset application status so the pipeline is consistent
    await query(
      `UPDATE applications SET status = 'applied', updated_at = NOW() WHERE id = $1`,
      [profile.application_id]
    );

    await cvParseQueue.add(
      "parse",
      {
        profileId: profile.id,
        candidateId: id,
        applicationId: profile.application_id,
        cvUrl: profile.raw_cv_url,
        cvKey,
        mimeType,
      },
      { jobId: existingJobId }
    );

    auditLog("cv_parse_retry", {
      session,
      entityType: "candidate",
      entityId: id,
      metadata: { profileId: profile.id },
    });

    return NextResponse.json<ApiResponse<{ queued: true }>>({
      success: true,
      data: { queued: true },
      message: "CV parse queued",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
