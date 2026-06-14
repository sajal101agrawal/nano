import { requireStaffingSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import Link from "next/link";
import { Users, UserPlus, ChevronRight } from "lucide-react";
import { ResourceFilters } from "./ResourceFilters";
import { formatRelativeTime, availabilityBadgeClass, getInitials } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function StaffingResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; availability?: string; page?: string }>;
}) {
  const session = await requireStaffingSession();
  const sp = await searchParams;
  const search = sp.search || "";
  const availability = sp.availability || "";
  const page = Math.max(1, parseInt(sp.page || "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  const conditions = ["sr.company_id = $1", "sr.status = 'active'"];
  const params: unknown[] = [session.companyId];

  if (availability) {
    params.push(availability);
    conditions.push(`sr.availability_status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(sr.full_name ILIKE $${params.length} OR sr.current_title ILIKE $${params.length} OR sr.email ILIKE $${params.length})`
    );
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const [resources, countRow] = await Promise.all([
    query<{
      id: string; full_name: string | null; email: string | null;
      current_title: string | null; total_experience_years: number | null;
      availability_status: string; skills: string[] | null; location: string | null;
      updated_at: string; profile_parse_status: string | null;
    }>(
      `SELECT sr.id, sr.full_name, sr.email, sr.current_title, sr.total_experience_years,
              sr.availability_status, sr.skills, sr.location, sr.updated_at,
              srp.parse_status AS profile_parse_status
       FROM staffing_resources sr
       LEFT JOIN staffing_resource_profiles srp ON srp.resource_id = sr.id AND srp.is_current = TRUE
       ${where}
       ORDER BY sr.updated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM staffing_resources sr ${where}`,
      params
    ),
  ]);

  const total = parseInt(countRow?.count || "0");
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Resources</h1>
          <p className="section-subtitle">{total} resource{total !== 1 ? "s" : ""} in your pool</p>
        </div>
        <Link href="/staffing/portal/resources/new" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          Add Resource
        </Link>
      </div>

      <ResourceFilters initialSearch={search} initialAvailability={availability} />

      {resources.length === 0 ? (
        <div className="empty-state py-16">
          <div className="empty-icon"><Users className="w-5 h-5 text-text-muted" /></div>
          <p className="empty-title">{search || availability ? "No results found" : "No resources yet"}</p>
          <p className="empty-desc">{search || availability ? "Try adjusting your filters." : "Add your first resource manually or upload CVs in bulk."}</p>
          {!search && !availability && (
            <div className="flex gap-2 mt-4">
              <Link href="/staffing/portal/resources/new" className="btn btn-primary btn-sm">Add manually</Link>
              <Link href="/staffing/portal/resources/upload" className="btn btn-secondary btn-sm">Upload CVs</Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-tertiary/50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Resource</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden lg:table-cell">Skills</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Availability</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden md:table-cell">Status</th>
                    <th className="w-8 px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resources.map((r) => {
                    const skills = r.skills ? r.skills.slice(0, 4) : [];
                    const name = r.full_name || r.email || "Unnamed";
                    return (
                      <tr key={r.id} className="table-row-hover">
                        <td className="px-5 py-3.5">
                          <Link href={`/staffing/portal/resources/${r.id}`} className="flex items-center gap-3 group">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0 text-violet-400 text-xs font-bold font-display">
                              {getInitials(name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-text-light group-hover:text-primary transition-colors truncate">
                                {name}
                              </p>
                              {r.current_title ? (
                                <p className="text-xs text-text-muted truncate">
                                  {r.current_title}{r.location ? ` · ${r.location}` : ""}{r.total_experience_years ? ` · ${r.total_experience_years}y` : ""}
                                </p>
                              ) : r.email ? (
                                <p className="text-xs text-text-muted truncate">{r.email}</p>
                              ) : null}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {skills.length > 0 ? skills.map((s) => (
                              <span key={s} className="badge badge-gray">{s}</span>
                            )) : <span className="text-xs text-text-muted">--</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={availabilityBadgeClass(r.availability_status)}>
                            {r.availability_status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          {(r.profile_parse_status === "pending" || r.profile_parse_status === "processing") ? (
                            <span className="badge badge-blue">Parsing CV</span>
                          ) : r.profile_parse_status === "completed" ? (
                            <span className="badge badge-green">Ready</span>
                          ) : (
                            <span className="text-xs text-text-muted">--</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <Link href={`/staffing/portal/resources/${r.id}`} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-light hover:bg-bg-hover transition-colors">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-border">
              {resources.map((r) => {
                const name = r.full_name || r.email || "Unnamed";
                return (
                  <Link key={r.id} href={`/staffing/portal/resources/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 table-row-hover">
                    <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0 text-violet-400 text-xs font-bold font-display">
                      {getInitials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-light truncate">{name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={availabilityBadgeClass(r.availability_status)}>{r.availability_status}</span>
                        {r.current_title && <span className="text-xs text-text-muted truncate">{r.current_title}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-text-muted">Page {page} of {totalPages} · {total} total</span>
              <div className="flex gap-2">
                {page > 1 && <Link href={`?page=${page - 1}&search=${search}&availability=${availability}`} className="btn btn-secondary btn-sm">Previous</Link>}
                {page < totalPages && <Link href={`?page=${page + 1}&search=${search}&availability=${availability}`} className="btn btn-secondary btn-sm">Next</Link>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
