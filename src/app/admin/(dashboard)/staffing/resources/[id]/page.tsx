import { getAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

function availabilityBadge(status: string) {
  const map: Record<string, string> = { available: "badge-green", unavailable: "badge-red", unknown: "badge-amber" };
  return `badge ${map[status] || "badge-gray"}`;
}

export default async function AdminResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;

  const resource = await queryOne<{
    id: string; full_name: string | null; email: string | null; phone: string | null;
    current_title: string | null; current_company: string | null;
    total_experience_years: number | null; location: string | null; work_mode: string | null;
    skills: string[] | null; availability_status: string; expected_rate: string | null;
    rate_currency: string | null; notice_period_days: number | null; notes: string | null;
    status: string; created_at: string; updated_at: string;
    company_name: string; company_id: string; company_domain: string | null;
    profile_id: string | null; raw_cv_url: string | null; raw_cv_filename: string | null;
    cv_signed_url: string | null; parsed_json: Record<string, unknown> | null;
    summary: string | null; profile_parse_status: string | null; profile_parse_error: string | null;
    profile_created_at: string | null;
  }>(
    `SELECT sr.id, sr.full_name, sr.email, sr.phone, sr.current_title, sr.current_company,
            sr.total_experience_years, sr.location, sr.work_mode, sr.skills,
            sr.availability_status, sr.expected_rate, sr.rate_currency, sr.notice_period_days,
            sr.notes, sr.status, sr.created_at, sr.updated_at,
            sc.name AS company_name, sc.id AS company_id, sc.domain AS company_domain,
            srp.id AS profile_id, srp.raw_cv_url, srp.raw_cv_filename,
            srp.parsed_json, srp.summary,
            srp.parse_status AS profile_parse_status,
            srp.parse_error AS profile_parse_error,
            srp.created_at AS profile_created_at,
            NULL AS cv_signed_url
     FROM staffing_resources sr
     JOIN staffing_companies sc ON sc.id = sr.company_id
     LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
     WHERE sr.id = $1 AND sr.status != 'deleted'`,
    [id]
  );

  if (!resource) notFound();

  const r = resource!;
  const parsedCV = r.parsed_json as Record<string, unknown> | null;
  const resourceSkills = r.skills as string[] | null;
  const parsedRoles = parsedCV?.roles as Array<{ title: string; company: string; start_date?: string; end_date?: string; is_current?: boolean; summary?: string }> | undefined;

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/staffing/resources" className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-bg-hover transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-muted" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="section-title truncate">{resource.full_name || "Unnamed Resource"}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {resource.current_title && <span className="text-text-dim text-sm">{resource.current_title}</span>}
            <span className="text-text-muted text-xs">·</span>
            <Link href={`/admin/staffing/companies/${resource.company_id}`} className="text-xs text-primary hover:underline">
              {resource.company_name}
            </Link>
          </div>
        </div>
        <span className={availabilityBadge(resource.availability_status)}>{resource.availability_status}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {resource.summary && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-text-light text-sm mb-3">AI Summary</h2>
              <p className="text-sm text-text-dim leading-relaxed">{resource.summary as string}</p>
            </div>
          )}

          {resourceSkills?.length ? (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-text-light text-sm mb-3">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {resourceSkills.map((s) => (
                  <span key={s} className="badge badge-gray">{s}</span>
                ))}
              </div>
            </div>
          ) : null}

          {parsedRoles && parsedRoles.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-text-light text-sm mb-3">Experience</h2>
              <div className="space-y-4">
                {parsedRoles.map((role, i) => (
                  <div key={i} className="border-l-2 border-border pl-4">
                    <p className="text-sm font-medium text-text-light">{role.title}</p>
                    <p className="text-xs text-text-muted">{role.company}</p>
                    <p className="text-xs text-text-muted">
                      {role.start_date || "?"} — {role.is_current ? "Present" : (role.end_date || "?")}
                    </p>
                    {role.summary && <p className="text-xs text-text-dim mt-1">{role.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-display font-semibold text-text-light text-sm mb-3">Details</h3>
            <dl className="space-y-2.5">
              {[
                { label: "Email", value: resource.email },
                { label: "Phone", value: resource.phone },
                { label: "Location", value: resource.location },
                { label: "Experience", value: resource.total_experience_years ? `${resource.total_experience_years} years` : null },
                { label: "Notice period", value: resource.notice_period_days != null ? `${resource.notice_period_days} days` : null },
                { label: "Expected rate", value: resource.expected_rate ? `${resource.expected_rate} ${resource.rate_currency || ""}` : null },
                { label: "Work mode", value: resource.work_mode },
              ].filter((d): d is { label: string; value: string } => !!d.value).map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[10px] text-text-muted uppercase tracking-wide">{label}</dt>
                  <dd className="text-sm text-text-dim mt-0.5">{value}</dd>
                </div>
              ))}
              {resource.notes && (
                <div>
                  <dt className="text-[10px] text-text-muted uppercase tracking-wide">Notes</dt>
                  <dd className="text-sm text-text-dim mt-0.5 whitespace-pre-wrap">{resource.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card p-5">
            <h3 className="font-display font-semibold text-text-light text-sm mb-3">CV</h3>
            {resource.profile_parse_status === "pending" || resource.profile_parse_status === "processing" ? (
              <p className="text-sm text-blue-400">Parsing in progress...</p>
            ) : resource.profile_parse_status === "completed" ? (
              <p className="text-sm text-emerald-400 mb-2">Profile parsed</p>
            ) : resource.profile_parse_status === "failed" ? (
              <p className="text-sm text-red-400 mb-2">Parse failed: {resource.profile_parse_error}</p>
            ) : (
              <p className="text-sm text-text-muted">No CV uploaded</p>
            )}
            {resource.raw_cv_filename && (
              <p className="text-xs text-text-muted">{resource.raw_cv_filename}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
