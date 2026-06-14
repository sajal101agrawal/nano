import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CompanyDetailActions } from "./CompanyDetailActions";

export const dynamic = "force-dynamic";

function availabilityBadge(status: string) {
  const map: Record<string, string> = {
    available: "badge badge-green",
    unavailable: "badge badge-red",
    unknown: "badge badge-amber",
  };
  return map[status] || "badge badge-gray";
}

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;

  const [company, users, resources, templates] = await Promise.all([
    queryOne<{
      id: string; name: string; domain: string | null; website: string | null;
      industry: string | null; notes: string | null; verified: boolean; created_at: string;
    }>(
      "SELECT * FROM staffing_companies WHERE id = $1",
      [id]
    ),
    query<{ id: string; name: string; email: string; designation: string | null; status: string; last_login_at: string | null; created_at: string }>(
      "SELECT id, name, email, designation, status, last_login_at, created_at FROM staffing_users WHERE company_id = $1 ORDER BY created_at DESC",
      [id]
    ),
    query<{
      id: string; full_name: string | null; current_title: string | null;
      availability_status: string; skills: string[] | null; created_at: string;
      profile_parse_status: string | null;
    }>(
      `SELECT sr.id, sr.full_name, sr.current_title, sr.availability_status, sr.skills, sr.created_at,
              srp.parse_status AS profile_parse_status
       FROM staffing_resources sr
       LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
       WHERE sr.company_id = $1 AND sr.status != 'deleted'
       ORDER BY sr.created_at DESC`,
      [id]
    ),
    query<{ id: string; name: string; template_type: string }>(
      "SELECT id, name, template_type FROM templates WHERE template_type LIKE 'staffing_%' ORDER BY name",
      []
    ),
  ]);

  if (!company) notFound();

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/staffing/companies" className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-bg-hover transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-muted" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="section-title">{company.name}</h1>
            {company.verified && <span className="badge badge-green">Verified</span>}
          </div>
          {company.domain && <p className="section-subtitle">@{company.domain}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Users */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold text-text-light text-[15px]">Portal Users ({users.length})</h2>
            </div>
            {users.length === 0 ? (
              <p className="text-sm text-text-muted px-5 py-4">No users registered for this company.</p>
            ) : (
              <div className="divide-y divide-border">
                {users.map((u) => (
                  <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-text-light">{u.name}</p>
                      <p className="text-xs text-text-muted">{u.email}{u.designation ? ` · ${u.designation}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`badge ${u.status === "active" ? "badge-green" : "badge-red"} text-[9px]`}>{u.status}</span>
                      {u.last_login_at && (
                        <p className="text-[10px] text-text-muted mt-0.5">{new Date(u.last_login_at).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resources */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold text-text-light text-[15px]">Resources ({resources.length})</h2>
              <Link href={`/admin/staffing/resources?company_id=${id}`} className="text-xs text-primary hover:underline">Filter in pool</Link>
            </div>
            {resources.length === 0 ? (
              <p className="text-sm text-text-muted px-5 py-4">No resources submitted yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {resources.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/staffing/resources/${r.id}`}
                    className="flex items-center justify-between px-5 py-3 table-row-hover gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-light">{r.full_name || "Unnamed"}</p>
                      {r.current_title && <p className="text-xs text-text-muted mt-0.5">{r.current_title}</p>}
                      {r.skills?.length ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {r.skills.slice(0, 4).map((s) => (
                            <span key={s} className="badge badge-gray text-[10px]">{s}</span>
                          ))}
                          {r.skills.length > 4 && <span className="text-[10px] text-text-muted">+{r.skills.length - 4}</span>}
                        </div>
                      ) : null}
                    </div>
                    <span className={availabilityBadge(r.availability_status)}>{r.availability_status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-display font-semibold text-text-light text-sm mb-3">Company Info</h3>
            <dl className="space-y-2">
              {company.website && (
                <div>
                  <dt className="text-[10px] text-text-muted uppercase tracking-wide">Website</dt>
                  <dd className="text-sm mt-0.5">
                    <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
                  </dd>
                </div>
              )}
              {company.industry && (
                <div>
                  <dt className="text-[10px] text-text-muted uppercase tracking-wide">Industry</dt>
                  <dd className="text-sm text-text-dim mt-0.5">{company.industry}</dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] text-text-muted uppercase tracking-wide">Registered</dt>
                <dd className="text-sm text-text-dim mt-0.5">{new Date(company.created_at).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>

          <CompanyDetailActions
            companyId={id}
            companyName={company.name}
            users={users.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.name, email: u.email }))}
            templates={templates}
            isVerified={company.verified}
          />
        </div>
      </div>
    </div>
  );
}
