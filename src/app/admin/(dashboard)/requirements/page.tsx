import { query } from "@/lib/db";
import { formatDate, requirementStatusBadgeClass } from "@/lib/cn";
import Link from "next/link";
import { Plus, ExternalLink, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

function StatusTabs({ current }: { current?: string }) {
  const tabs = [
    { label: "All", value: "" },
    { label: "Open", value: "open" },
    { label: "On Hold", value: "on_hold" },
    { label: "Filled", value: "filled" },
    { label: "Closed", value: "closed" },
  ];
  return (
    <div className="flex gap-1 p-1 bg-bg-tertiary border border-border rounded-lg w-fit flex-wrap">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.value ? `/admin/requirements?status=${t.value}` : "/admin/requirements"}
          className={[
            "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
            (current === t.value || (!current && !t.value))
              ? "bg-bg-secondary text-text-light shadow-xs"
              : "text-text-muted hover:text-text-dim",
          ].join(" ")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default async function RequirementsPage({ searchParams }: PageProps) {
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (status) {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }

  const [rows, countRows] = await Promise.all([
    query<{
      id: string; title: string; status: string; engagement_type: string;
      work_mode: string; public_slug: string; client_name: string;
      application_count: string; created_at: string; location: string;
    }>(
      `SELECT r.id, r.title, r.status, r.engagement_type, r.work_mode, r.location,
              r.public_slug, c.company_name AS client_name, r.created_at,
              COUNT(a.id) AS application_count
       FROM requirements r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN applications a ON a.requirement_id = r.id
       ${where}
       GROUP BY r.id, c.company_name
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(DISTINCT r.id) AS count FROM requirements r ${where}`,
      params
    ),
  ]);

  const total = parseInt(countRows[0]?.count || "0");
  const totalPages = Math.ceil(total / limit);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Requirements</h1>
          <p className="section-subtitle">{total} total positions</p>
        </div>
        <Link href="/admin/requirements/new" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Requirement</span>
          <span className="sm:hidden">New</span>
        </Link>
      </div>

      <StatusTabs current={status} />

      <div className="card overflow-hidden mt-4">
        {/* Table — desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-tertiary/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden lg:table-cell">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Apps</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden xl:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-text-muted text-sm">
                    No requirements found.{" "}
                    <Link href="/admin/requirements/new" className="text-primary hover:underline">Create one</Link>
                  </td>
                </tr>
              ) : (
                rows.map((req) => (
                  <tr key={req.id} className="table-row-hover">
                    <td className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-2 group">
                        <Link href={`/admin/requirements/${req.id}`} className="min-w-0">
                          <span className="text-sm font-medium text-text-light group-hover:text-primary transition-colors block">
                            {req.title}
                          </span>
                          <span className="font-mono text-[11px] text-text-muted mt-0.5 block">
                            /jobs/{req.public_slug}
                          </span>
                        </Link>
                        <a
                          href={`${appUrl}/jobs/${req.public_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-primary transition-colors shrink-0 mt-0.5"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-sm text-text-dim">{req.client_name || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className="badge badge-indigo capitalize">{req.engagement_type}</span>
                        {req.work_mode && (
                          <span className="badge badge-gray capitalize">{req.work_mode}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={requirementStatusBadgeClass(req.status)}>
                        {req.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm font-medium text-text-light tabular-nums">
                        {req.application_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right hidden xl:table-cell">
                      <span className="text-xs text-text-muted">{formatDate(req.created_at)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Cards — mobile */}
        <div className="md:hidden divide-y divide-border">
          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-text-muted text-sm">
              No requirements.{" "}
              <Link href="/admin/requirements/new" className="text-primary">Create one</Link>
            </div>
          ) : (
            rows.map((req) => (
              <Link key={req.id} href={`/admin/requirements/${req.id}`} className="block px-4 py-4 table-row-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-light truncate">{req.title}</p>
                    {req.client_name && (
                      <p className="text-xs text-text-muted mt-0.5">{req.client_name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={requirementStatusBadgeClass(req.status)}>{req.status.replace(/_/g, " ")}</span>
                      <span className="badge badge-indigo capitalize">{req.engagement_type}</span>
                      <span className="text-xs text-text-muted">{req.application_count} apps</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/requirements?page=${page - 1}${status ? `&status=${status}` : ""}`}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/requirements?page=${page + 1}${status ? `&status=${status}` : ""}`}
                className="btn btn-secondary btn-sm"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
