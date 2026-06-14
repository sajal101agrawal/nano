import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const search = sp.search || "";
  const page = Math.max(1, parseInt(sp.page || "1"));
  const limit = 25;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(sc.name ILIKE $${params.length} OR sc.domain ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [companies, countRow] = await Promise.all([
    query<{
      id: string; name: string; domain: string | null; verified: boolean;
      website: string | null; created_at: string; user_count: string; resource_count: string;
    }>(
      `SELECT sc.id, sc.name, sc.domain, sc.verified, sc.website, sc.created_at,
              COUNT(DISTINCT su.id) AS user_count,
              COUNT(DISTINCT sr.id) AS resource_count
       FROM staffing_companies sc
       LEFT JOIN staffing_users su ON su.company_id = sc.id
       LEFT JOIN staffing_resources sr ON sr.company_id = sc.id AND sr.status != 'deleted'
       ${where}
       GROUP BY sc.id
       ORDER BY sc.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM staffing_companies sc ${where}`,
      params
    ),
  ]);

  const total = parseInt(countRow?.count || "0");
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Staffing Companies</h1>
          <p className="section-subtitle">{total} compan{total !== 1 ? "ies" : "y"}</p>
        </div>
      </div>

      <form method="GET" className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={search}
            className="input-base w-full !pl-9"
            placeholder="Search by name or domain..."
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">Search</button>
      </form>

      {companies.length === 0 ? (
        <div className="empty-state py-16">
          <div className="empty-icon"><Building2 className="w-5 h-5 text-text-muted" /></div>
          <p className="empty-title">No companies found</p>
          <p className="empty-desc">Companies are created automatically when vendors register.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="divide-y divide-border">
              {companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/staffing/companies/${c.id}`}
                  className="flex items-start justify-between px-5 py-4 table-row-hover gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-light">{c.name}</p>
                      {c.verified && <span className="badge badge-green text-[9px]">Verified</span>}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {[c.domain ? `@${c.domain}` : null, c.website].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right text-xs text-text-muted shrink-0">
                    <p>{c.user_count} user{parseInt(c.user_count) !== 1 ? "s" : ""}</p>
                    <p className="mt-0.5">{c.resource_count} resource{parseInt(c.resource_count) !== 1 ? "s" : ""}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              {page > 1 && (
                <Link href={`?page=${page - 1}&search=${search}`} className="btn btn-secondary btn-sm">Previous</Link>
              )}
              <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
              {page < totalPages && (
                <Link href={`?page=${page + 1}&search=${search}`} className="btn btn-secondary btn-sm">Next</Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
