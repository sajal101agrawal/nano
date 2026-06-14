import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function availabilityBadge(status: string) {
  const map: Record<string, string> = {
    available: "badge badge-green",
    unavailable: "badge badge-red",
    unknown: "badge badge-amber",
  };
  return map[status] || "badge badge-gray";
}

export default async function AdminStaffingResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; availability?: string; company_id?: string; page?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const search = sp.search || "";
  const availability = sp.availability || "";
  const companyId = sp.company_id || "";
  const page = Math.max(1, parseInt(sp.page || "1"));
  const limit = 25;
  const offset = (page - 1) * limit;

  const conditions = ["sr.status != 'deleted'"];
  const params: unknown[] = [];

  if (companyId) {
    params.push(companyId);
    conditions.push(`sr.company_id = $${params.length}`);
  }

  if (availability) {
    params.push(availability);
    conditions.push(`sr.availability_status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(sr.full_name ILIKE $${params.length} OR sr.current_title ILIKE $${params.length} OR sr.email ILIKE $${params.length} OR $${params.length} ILIKE ANY(SELECT unnest(sr.skills)))`
    );
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const [resources, countRow, companyFilter] = await Promise.all([
    query<{
      id: string; full_name: string | null; email: string | null; current_title: string | null;
      total_experience_years: number | null; availability_status: string; skills: string[] | null;
      location: string | null; company_name: string; company_id: string; updated_at: string;
      profile_parse_status: string | null; summary: string | null;
    }>(
      `SELECT sr.id, sr.full_name, sr.email, sr.current_title, sr.total_experience_years,
              sr.availability_status, sr.skills, sr.location, sr.updated_at,
              sc.name AS company_name, sc.id AS company_id,
              srp.parse_status AS profile_parse_status, srp.summary
       FROM staffing_resources sr
       JOIN staffing_companies sc ON sc.id = sr.company_id
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
    companyId
      ? queryOne<{ name: string }>("SELECT name FROM staffing_companies WHERE id = $1", [companyId])
      : Promise.resolve(null),
  ]);

  const total = parseInt(countRow?.count || "0");
  const totalPages = Math.ceil(total / limit);

  const AVAIL = [
    { value: "", label: "All" },
    { value: "available", label: "Available" },
    { value: "unavailable", label: "Unavailable" },
    { value: "unknown", label: "Unknown" },
  ];

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Resource Pool</h1>
          <p className="section-subtitle">
            {total} resource{total !== 1 ? "s" : ""}
            {companyFilter ? ` from ${companyFilter.name}` : " across all companies"}
          </p>
        </div>
        {companyId && (
          <Link href="/admin/staffing/resources" className="text-xs text-primary hover:underline">Clear company filter</Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <form method="GET" className="flex gap-2 flex-1 min-w-48">
          {companyId && <input type="hidden" name="company_id" value={companyId} />}
          {availability && <input type="hidden" name="availability" value={availability} />}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              className="input-base w-full !pl-9"
              placeholder="Search name, title, skills..."
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">Search</button>
        </form>
        <div className="flex gap-1">
          {AVAIL.map((o) => (
            <Link
              key={o.value}
              href={`?search=${search}&availability=${o.value}&company_id=${companyId}`}
              className={`btn btn-sm ${availability === o.value ? "btn-primary" : "btn-secondary"}`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      {resources.length === 0 ? (
        <div className="empty-state py-16">
          <div className="empty-icon"><Users className="w-5 h-5 text-text-muted" /></div>
          <p className="empty-title">No resources found</p>
          <p className="empty-desc">Resources submitted by staffing companies will appear here.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="divide-y divide-border">
              {resources.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/staffing/resources/${r.id}`}
                  className="flex items-start gap-4 px-5 py-4 table-row-hover"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-light">{r.full_name || "Unnamed"}</p>
                      <span className="text-[10px] text-text-muted">
                        {r.company_name}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {[r.current_title, r.location].filter(Boolean).join(" · ")}
                      {r.total_experience_years ? ` · ${r.total_experience_years}y` : ""}
                    </p>
                    {r.summary && (
                      <p className="text-xs text-text-muted mt-1 line-clamp-1">{r.summary}</p>
                    )}
                    {r.skills?.length ? (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.skills.slice(0, 6).map((s) => (
                          <span key={s} className="badge badge-gray text-[10px]">{s}</span>
                        ))}
                        {r.skills.length > 6 && <span className="text-[10px] text-text-muted">+{r.skills.length - 6}</span>}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={availabilityBadge(r.availability_status)}>{r.availability_status}</span>
                    {(r.profile_parse_status === "pending" || r.profile_parse_status === "processing") && (
                      <p className="text-[10px] text-blue-400 mt-1">Parsing...</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              {page > 1 && (
                <Link href={`?page=${page - 1}&search=${search}&availability=${availability}&company_id=${companyId}`} className="btn btn-secondary btn-sm">Previous</Link>
              )}
              <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
              {page < totalPages && (
                <Link href={`?page=${page + 1}&search=${search}&availability=${availability}&company_id=${companyId}`} className="btn btn-secondary btn-sm">Next</Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
