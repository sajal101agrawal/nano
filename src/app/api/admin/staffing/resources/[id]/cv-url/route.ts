import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getSignedDownloadUrl, extractKeyFromUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const profile = await queryOne<{ raw_cv_url: string; raw_cv_filename: string | null }>(
      `SELECT raw_cv_url, raw_cv_filename
       FROM staffing_resource_profiles
       WHERE resource_id = $1 AND is_current = TRUE`,
      [id]
    );

    if (!profile?.raw_cv_url) {
      return NextResponse.json({ success: false, error: "No CV found" }, { status: 404 });
    }

    const key = extractKeyFromUrl(profile.raw_cv_url);
    const url = await getSignedDownloadUrl(key);

    return NextResponse.json({
      success: true,
      data: { url, filename: profile.raw_cv_filename || "cv" },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
