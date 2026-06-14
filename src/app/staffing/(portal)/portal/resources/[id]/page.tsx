import { requireStaffingSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { notFound } from "next/navigation";
import { ResourceDetailClient } from "./ResourceDetailClient";

export const dynamic = "force-dynamic";

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffingSession();
  const { id } = await params;

  const resource = await queryOne<{
    id: string; company_id: string; full_name?: string; email?: string;
    phone?: string; current_title?: string; current_company?: string;
    total_experience_years?: number; location?: string; work_mode?: string;
    skills?: string[]; availability_status: "available" | "unavailable" | "unknown";
    expected_rate?: string; rate_currency?: string; notice_period_days?: number;
    notes?: string; status: "active" | "inactive" | "deleted";
    created_at: string; updated_at: string;
    profile_id?: string; raw_cv_url?: string; raw_cv_filename?: string;
    parsed_json?: Record<string, unknown>; summary?: string;
    profile_parse_status?: string; profile_parse_error?: string;
  }>(
    `SELECT sr.*,
            srp.id AS profile_id, srp.raw_cv_url, srp.raw_cv_filename,
            srp.parsed_json, srp.summary,
            srp.parse_status AS profile_parse_status,
            srp.parse_error AS profile_parse_error
     FROM staffing_resources sr
     LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
     WHERE sr.id = $1 AND sr.status != 'deleted'`,
    [id]
  );

  if (!resource || resource.company_id !== session.companyId) {
    notFound();
  }

  return <ResourceDetailClient resource={resource} />;
}
