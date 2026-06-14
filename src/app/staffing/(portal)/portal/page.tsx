import { requireStaffingSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import Link from "next/link";
import { Users, UserCheck, UserX, HelpCircle, Upload, UserPlus, ChevronRight } from "lucide-react";
import { availabilityBadgeClass, getInitials } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function StaffingPortalDashboard() {
  const session = await requireStaffingSession();

  const [stats, recentResources] = await Promise.all([
    queryOne<{
      total: string; available: string; unavailable: string; unknown: string; pending_parse: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS total,
         COUNT(*) FILTER (WHERE availability_status = 'available' AND status = 'active') AS available,
         COUNT(*) FILTER (WHERE availability_status = 'unavailable' AND status = 'active') AS unavailable,
         COUNT(*) FILTER (WHERE availability_status = 'unknown' AND status = 'active') AS unknown,
         (SELECT COUNT(*) FROM staffing_resource_profiles srp
          JOIN staffing_resources sr2 ON sr2.id = srp.resource_id
          WHERE sr2.company_id = $1 AND srp.is_current = TRUE AND srp.parse_status IN ('pending','processing')) AS pending_parse
       FROM staffing_resources
       WHERE company_id = $1`,
      [session.companyId]
    ),
    query<{
      id: string; full_name: string | null; current_title: string | null;
      availability_status: string; created_at: string; profile_parse_status: string | null;
    }>(
      `SELECT sr.id, sr.full_name, sr.current_title, sr.availability_status, sr.created_at,
              srp.parse_status AS profile_parse_status
       FROM staffing_resources sr
       LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
       WHERE sr.company_id = $1 AND sr.status = 'active'
       ORDER BY sr.created_at DESC
       LIMIT 8`,
      [session.companyId]
    ),
  ]);

  const total = parseInt(stats?.total || "0");
  const available = parseInt(stats?.available || "0");
  const unavailable = parseInt(stats?.unavailable || "0");
  const unknown = parseInt(stats?.unknown || "0");
  const pendingParse = parseInt(stats?.pending_parse || "0");

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">Welcome back, {session.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/staffing/portal/resources/upload" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            Bulk Upload
          </Link>
          <Link href="/staffing/portal/resources/new" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            Add Resource
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">Total Resources</span>
          </div>
          <div className="font-display text-2xl font-bold text-text-light tabular-nums">{total}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-text-muted">Available</span>
          </div>
          <div className="font-display text-2xl font-bold text-emerald-400 tabular-nums">{available}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <UserX className="w-4 h-4 text-red-400" />
            <span className="text-xs text-text-muted">Unavailable</span>
          </div>
          <div className="font-display text-2xl font-bold text-red-400 tabular-nums">{unavailable}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-text-muted">Unknown</span>
          </div>
          <div className="font-display text-2xl font-bold text-amber-400 tabular-nums">{unknown}</div>
        </div>
      </div>

      {pendingParse > 0 && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
          {pendingParse} CV{pendingParse !== 1 ? "s are" : " is"} currently being processed by our AI. Profiles will update automatically.
        </div>
      )}

      {/* Recent resources */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-text-light text-[15px]">Recent Resources</h2>
          <Link href="/staffing/portal/resources" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {recentResources.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-icon"><Users className="w-5 h-5 text-text-muted" /></div>
            <p className="empty-title">No resources yet</p>
            <p className="empty-desc">Add your first resource manually or upload CVs in bulk.</p>
            <div className="flex gap-2 mt-4">
              <Link href="/staffing/portal/resources/new" className="btn btn-primary btn-sm">Add manually</Link>
              <Link href="/staffing/portal/resources/upload" className="btn btn-secondary btn-sm">Upload CVs</Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentResources.map((r) => {
              const name = r.full_name || "Unnamed resource";
              return (
                <Link
                  key={r.id}
                  href={`/staffing/portal/resources/${r.id}`}
                  className="flex items-center gap-3 px-5 py-3 table-row-hover"
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0 text-violet-400 text-xs font-bold font-display">
                    {getInitials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-light truncate">{name}</p>
                    {r.current_title && (
                      <p className="text-xs text-text-muted mt-0.5 truncate">{r.current_title}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={availabilityBadgeClass(r.availability_status)}>
                      {r.availability_status}
                    </span>
                    {(r.profile_parse_status === "processing" || r.profile_parse_status === "pending") && (
                      <span className="badge badge-blue">Parsing</span>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
