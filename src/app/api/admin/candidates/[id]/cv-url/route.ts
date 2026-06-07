import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getSignedDownloadUrl, extractKeyFromUrl } from "@/lib/storage";
import { auditLog } from "@/lib/utils";
import type { ApiResponse, CandidateProfile } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const profile = await queryOne<Pick<CandidateProfile, "raw_cv_url" | "raw_cv_filename">>(
      `SELECT raw_cv_url, raw_cv_filename
       FROM candidate_profiles
       WHERE candidate_id = $1 AND is_current = TRUE`,
      [id]
    );

    if (!profile?.raw_cv_url) {
      return NextResponse.json({ success: false, error: "No CV found" }, { status: 404 });
    }

    const key = extractKeyFromUrl(profile.raw_cv_url);
    const url = await getSignedDownloadUrl(key);

    auditLog("cv_download", {
      session,
      entityType: "candidate",
      entityId: id,
      metadata: { filename: profile.raw_cv_filename },
    });

    return NextResponse.json<ApiResponse<{ url: string; filename: string }>>({
      success: true,
      data: {
        url,
        filename: profile.raw_cv_filename || "cv.pdf",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
