import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Users, UserCheck, UserX, HelpCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminStaffingOverviewPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [companyCount, userCount, resourceStats, recentCompanies] = await Promise.all([
    queryOne<{ count: string }>("SELECT COUNT(*) AS count FROM staffing_companies"),
    queryOne<{ count: string }>("SELECT COUNT(*) AS count FROM staffing_users WHERE status = 'active'"),
    queryOne<{ total: string; available: string; unavailable: string; unknown: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS total,
         COUNT(*) FILTER (WHERE availability_status = 'available' AND status = 'active') AS available,
         COUNT(*) FILTER (WHERE availability_status = 'unavailable' AND status = 'active') AS unavailable,
         COUNT(*) FILTER (WHERE availability_status = 'unknown' AND status = 'active') AS unknown
       FROM staffing_resources`
    ),
    query<{ id: string; name: string; domain: string | null; verified: boolean; user_count: string; resource_count: string; created_at: string }>(
      `SELECT sc.id, sc.name, sc.domain, sc.verified, sc.created_at,
              COUNT(DISTINCT su.id) AS user_count,
              COUNT(DISTINCT sr.id) AS resource_count
       FROM staffing_companies sc
       LEFT JOIN staffing_users su ON su.company_id = sc.id
       LEFT JOIN staffing_resources sr ON sr.company_id = sc.id AND sr.status != 'deleted'
       GROUP BY sc.id
       ORDER BY sc.created_at DESC
       LIMIT 8`
    ),
  ]);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Staffing Partners</h1>
          <p className="section-subtitle">Manage vendor companies, users, and their resource pools</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/staffing/resources" className="btn btn-secondary btn-sm">View Resources</Link>
          <Link href="/admin/staffing/companies" className="btn btn-primary btn-sm">All Companies</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">Companies</span>
          </div>
          <div className="font-display text-2xl font-bold text-text-light">{parseInt(companyCount?.count || "0")}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">Active Users</span>
          </div>
          <div className="font-display text-2xl font-bold text-text-light">{parseInt(userCount?.count || "0")}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-text-muted">Available</span>
          </div>
          <div className="font-display text-2xl font-bold text-emerald-400">{parseInt(resourceStats?.available || "0")}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-text-muted">Total Resources</span>
          </div>
          <div className="font-display text-2xl font-bold text-text-light">{parseInt(resourceStats?.total || "0")}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-text-light text-[15px]">Recent Companies</h2>
          <Link href="/admin/staffing/companies" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {recentCompanies.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-icon"><Building2 className="w-5 h-5 text-text-muted" /></div>
            <p className="empty-title">No staffing companies yet</p>
            <p className="empty-desc">Companies will appear here as vendors register on the portal.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentCompanies.map((c) => (
              <Link
                key={c.id}
                href={`/admin/staffing/companies/${c.id}`}
                className="flex items-center justify-between px-5 py-3 table-row-hover"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-light">{c.name}</p>
                    {c.verified && <span className="badge badge-green text-[9px]">Verified</span>}
                  </div>
                  {c.domain && <p className="text-xs text-text-muted mt-0.5">@{c.domain}</p>}
                </div>
                <div className="text-right text-xs text-text-muted">
                  <span>{c.user_count} user{parseInt(c.user_count) !== 1 ? "s" : ""}</span>
                  <span className="mx-1">·</span>
                  <span>{c.resource_count} resource{parseInt(c.resource_count) !== 1 ? "s" : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
