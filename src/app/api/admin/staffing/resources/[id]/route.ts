import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const resource = await queryOne(
      `SELECT sr.*,
              sc.name AS company_name, sc.domain AS company_domain,
              srp.id AS profile_id, srp.raw_cv_url, srp.raw_cv_filename,
              srp.parsed_json, srp.summary, srp.parse_status AS profile_parse_status,
              srp.parse_error AS profile_parse_error, srp.created_at AS profile_created_at
       FROM staffing_resources sr
       JOIN staffing_companies sc ON sc.id = sr.company_id
       LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
       WHERE sr.id = $1 AND sr.status != 'deleted'`,
      [id]
    );

    if (!resource) {
      return NextResponse.json({ success: false, error: "Resource not found" }, { status: 404 });
    }

    // Generate signed CV URL if available
    const resourceData = resource as Record<string, unknown>;
    if (resourceData.raw_cv_url) {
      try {
        const key = (resourceData.raw_cv_url as string).split("/nano-cvs/")[1] || resourceData.raw_cv_url as string;
        resourceData.cv_signed_url = await getSignedDownloadUrl(key);
      } catch {
        resourceData.cv_signed_url = null;
      }
    }

    return NextResponse.json({ success: true, data: resource });
  } catch (err) {
    console.error("[admin/staffing/resources/[id] GET]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
