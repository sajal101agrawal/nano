import { query, queryOne } from "@/lib/db";
import { requireAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatRelativeTime, availabilityBadgeClass, getInitials } from "@/lib/cn";
import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import PoolFilters from "./PoolFilters";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    availability?: string;
    source?: string;
    page?: string;
  }>;
}

type PoolRow = {
  id: string;
  type: "candidate" | "staffing";
  full_name: string | null;
  email: string | null;
  current_title: string | null;
  current_company: string | null;
  availability_status: string;
  skills: string | null;
  total_experience_years: number | null;
  last_active_at: string | null;
  source_label: string;
  detail_url: string;
};

function buildPageUrl(sp: Awaited<PageProps["searchParams"]>, newPage: number) {
  const p = new URLSearchParams();
  if (sp.q) p.set("q", sp.q);
  if (sp.availability) p.set("availability", sp.availability);
  if (sp.source) p.set("source", sp.source);
  p.set("page", String(newPage));
  return `/admin/pool?${p.toString()}`;
}

export default async function PoolPage({ searchParams }: PageProps) {
  await requireAdminSession();
  const sp = await searchParams;

  const q = sp.q?.trim() || "";
  const availability = sp.availability || "";
  const source = sp.source || "all";
  const page = Math.max(1, parseInt(sp.page || "1"));
  const limit = 30;
  const offset = (page - 1) * limit;

  // Build candidate conditions
  const candidateConditions: string[] = ["c.status != 'deleted'"];
  const sharedParams: unknown[] = [];

  if (availability) {
    sharedParams.push(availability);
    candidateConditions.push(`c.availability_status = $${sharedParams.length}`);
  }
  if (q) {
    sharedParams.push(`%${q}%`);
    candidateConditions.push(
      `(c.full_name ILIKE $${sharedParams.length}
        OR c.primary_email ILIKE $${sharedParams.length}
        OR c.current_title ILIKE $${sharedParams.length}
        OR EXISTS (SELECT 1 FROM candidate_skills cs WHERE cs.candidate_id = c.id AND cs.skill ILIKE $${sharedParams.length}))`
    );
  }
  const candidateWhere = `WHERE ${candidateConditions.join(" AND ")}`;

  // Build staffing resource conditions
  const staffingConditions: string[] = ["sr.status != 'deleted'"];
  if (availability) {
    staffingConditions.push(`sr.availability_status = $${sharedParams.length === 0 ? 1 : sharedParams.indexOf(availability) + 1}`);
  }
  if (q) {
    const qParamIdx = sharedParams.length; // same $N as candidate search
    staffingConditions.push(
      `(sr.full_name ILIKE $${qParamIdx}
        OR sr.email ILIKE $${qParamIdx}
        OR sr.current_title ILIKE $${qParamIdx}
        OR EXISTS (SELECT 1 FROM staffing_resource_skills srs WHERE srs.resource_id = sr.id AND srs.skill ILIKE $${qParamIdx}))`
    );
  }
  const staffingWhere = `WHERE ${staffingConditions.join(" AND ")}`;

  const candidateQuery = `
    SELECT
      c.id,
      'candidate' AS type,
      c.full_name,
      c.primary_email AS email,
      c.current_title,
      c.current_company,
      c.availability_status,
      COALESCE(
        (SELECT STRING_AGG(cs.skill, ',' ORDER BY cs.years DESC NULLS LAST)
         FROM candidate_skills cs WHERE cs.candidate_id = c.id LIMIT 5),
        ''
      ) AS skills,
      COALESCE(cp.total_experience_years, c.total_experience_years) AS total_experience_years,
      c.last_active_at,
      c.source AS source_label,
      '/admin/candidates/' || c.id AS detail_url
    FROM candidates c
    LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE
    ${candidateWhere}
  `;

  const staffingQuery = `
    SELECT
      sr.id,
      'staffing' AS type,
      sr.full_name,
      sr.email,
      sr.current_title,
      sr.current_company,
      sr.availability_status,
      ARRAY_TO_STRING(sr.skills, ',') AS skills,
      sr.total_experience_years,
      sr.updated_at AS last_active_at,
      sc.name AS source_label,
      '/admin/pool/staffing/' || sr.id AS detail_url
    FROM staffing_resources sr
    JOIN staffing_companies sc ON sc.id = sr.company_id
    ${staffingWhere}
  `;

  let unionQuery: string;
  let countQuery: string;

  if (source === "candidates") {
    unionQuery = candidateQuery;
    countQuery = `SELECT COUNT(*) AS count FROM candidates c LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE ${candidateWhere}`;
  } else if (source === "staffing") {
    unionQuery = staffingQuery;
    countQuery = `SELECT COUNT(*) AS count FROM staffing_resources sr JOIN staffing_companies sc ON sc.id = sr.company_id ${staffingWhere}`;
  } else {
    unionQuery = `${candidateQuery} UNION ALL ${staffingQuery}`;
    countQuery = `
      SELECT SUM(cnt) AS count FROM (
        SELECT COUNT(*) AS cnt FROM candidates c LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE ${candidateWhere}
        UNION ALL
        SELECT COUNT(*) AS cnt FROM staffing_resources sr JOIN staffing_companies sc ON sc.id = sr.company_id ${staffingWhere}
      ) t
    `;
  }

  const [rows, countResult] = await Promise.all([
    query<PoolRow>(
      `SELECT * FROM (${unionQuery}) combined
       ORDER BY last_active_at DESC NULLS LAST
       LIMIT $${sharedParams.length + 1} OFFSET $${sharedParams.length + 2}`,
      [...sharedParams, limit, offset]
    ),
    queryOne<{ count: string }>(countQuery, sharedParams),
  ]);

  const total = parseInt(countResult?.count || "0");
  const totalPages = Math.ceil(total / limit);
  const hasFilters = !!(q || availability || (source !== "all"));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Talent Pool</h1>
          <p className="section-subtitle">
            {total} {hasFilters ? "matching" : "total"} people across all sources
          </p>
        </div>
      </div>

      <PoolFilters
        initialQ={q}
        initialAvailability={availability}
        initialSource={source}
      />

      <div className="card overflow-hidden mt-4">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-tertiary/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Person</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden lg:table-cell">Skills</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Availability</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden md:table-cell">Source</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden md:table-cell">Last active</th>
                <th className="w-8 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-bg-hover flex items-center justify-center">
                        <Users className="w-5 h-5 text-text-muted" />
                      </div>
                      <p className="text-sm text-text-muted">
                        {hasFilters ? "No results match your filters." : "No people in the pool yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const skills = row.skills ? row.skills.split(",").filter(Boolean).slice(0, 4) : [];
                  const name = row.full_name || row.email || "Unknown";
                  return (
                    <tr key={`${row.type}-${row.id}`} className="table-row-hover">
                      <td className="px-5 py-3.5">
                        <Link href={row.detail_url} className="flex items-center gap-3 group">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold font-display ${
                            row.type === "staffing"
                              ? "bg-violet-500/15 text-violet-400"
                              : "bg-primary/15 text-primary"
                          }`}>
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-light group-hover:text-primary transition-colors truncate">
                              {name}
                            </p>
                            {row.current_title ? (
                              <p className="text-xs text-text-muted truncate">
                                {row.current_title}{row.current_company ? ` · ${row.current_company}` : ""}
                              </p>
                            ) : row.email ? (
                              <p className="text-xs text-text-muted truncate">{row.email}</p>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {skills.length > 0 ? (
                            skills.map((s) => (
                              <span key={s} className="badge badge-gray">{s}</span>
                            ))
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={availabilityBadgeClass(row.availability_status)}>
                          {row.availability_status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className={`badge ${row.type === "staffing" ? "badge-purple" : "badge-blue"}`}>
                          {row.type === "staffing" ? row.source_label : row.source_label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right hidden md:table-cell">
                        <span className="text-xs text-text-muted">
                          {row.last_active_at ? formatRelativeTime(row.last_active_at) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <Link href={row.detail_url} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-light hover:bg-bg-hover transition-colors">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-border">
          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-text-muted text-sm">
              No results{hasFilters ? " match your filters" : ""}.
            </div>
          ) : (
            rows.map((row) => {
              const skills = row.skills ? row.skills.split(",").filter(Boolean).slice(0, 3) : [];
              const name = row.full_name || row.email || "Unknown";
              return (
                <Link key={`${row.type}-${row.id}`} href={row.detail_url} className="flex items-center gap-3 px-4 py-3.5 table-row-hover">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold font-display ${
                    row.type === "staffing" ? "bg-violet-500/15 text-violet-400" : "bg-primary/15 text-primary"
                  }`}>
                    {getInitials(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-light truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={availabilityBadgeClass(row.availability_status)}>
                        {row.availability_status}
                      </span>
                      {skills.slice(0, 2).map((s) => (
                        <span key={s} className="badge badge-gray">{s}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                </Link>
              );
            })
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-text-muted">Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={buildPageUrl(sp, page - 1)} className="btn btn-secondary btn-sm">Previous</Link>}
            {page < totalPages && <Link href={buildPageUrl(sp, page + 1)} className="btn btn-secondary btn-sm">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
