import { query } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";
import Link from "next/link";
import { formatRelativeTime, availabilityBadgeClass, getInitials } from "@/lib/cn";
import CandidateFilters from "./CandidateFilters";
import DeleteButton from "@/components/admin/DeleteButton";
import { Users, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    availability?: string;
    contract?: string;
    min_experience?: string;
    page?: string;
  }>;
}

type ResolvedSP = { q?: string; availability?: string; contract?: string; min_experience?: string; page?: string };

type CandidateRow = {
  id: string; full_name: string; primary_email: string; headline: string;
  availability_status: string; open_to_contract: boolean;
  total_experience_years: number; last_active_at: string;
  current_title: string; current_company: string;
  raw_skills: string;
};

function buildPageUrl(sp: ResolvedSP, newPage: number) {
  const p = new URLSearchParams();
  if (sp.q) p.set("q", sp.q);
  if (sp.availability) p.set("availability", sp.availability);
  if (sp.contract) p.set("contract", sp.contract);
  if (sp.min_experience) p.set("min_experience", sp.min_experience);
  p.set("page", String(newPage));
  return `/admin/candidates?${p.toString()}`;
}

const SELECT_COLS = `
  c.id, c.full_name, c.primary_email, c.current_title,
  c.current_company, c.availability_status, c.open_to_contract,
  c.last_active_at,
  COALESCE(cp.total_experience_years, c.total_experience_years) AS total_experience_years,
  COALESCE(
    (SELECT STRING_AGG(cs.skill, ',' ORDER BY cs.years DESC NULLS LAST)
     FROM candidate_skills cs WHERE cs.candidate_id = c.id LIMIT 5),
    ''
  ) AS raw_skills
`;

// Minimum cosine similarity threshold for vector search results (0-1 scale)
// OpenAI embeddings typically produce lower scores (10-30%) for query-to-document matching
const MIN_VECTOR_SCORE = 0.05;

async function getCandidatesHybridSearch(
  q: string,
  sp: ResolvedSP
): Promise<{ rows: CandidateRow[]; total: number; page: number; totalPages: number; isVectorSearch: boolean }> {
  const availability = sp.availability || "";
  const contract = sp.contract === "true";
  const minExp = sp.min_experience ? parseInt(sp.min_experience) : null;
  const page = Math.max(1, parseInt(sp.page || "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  let embedding: number[];
  try {
    embedding = await generateEmbedding(q);
  } catch {
    return { ...(await getCandidatesFallback(q, sp)), isVectorSearch: false };
  }

  const vectorStr = `[${embedding.join(",")}]`;

  // Build filter conditions
  const filterConditions: string[] = ["c.status != 'deleted'", "cp.is_current = TRUE"];
  const filterParams: unknown[] = [vectorStr, q]; // $1 = vector, $2 = search query

  if (availability) {
    filterParams.push(availability);
    filterConditions.push(`c.availability_status = $${filterParams.length}`);
  }
  if (contract) {
    filterConditions.push("c.open_to_contract = TRUE");
  }
  if (minExp !== null) {
    filterParams.push(minExp);
    filterConditions.push(`COALESCE(cp.total_experience_years, c.total_experience_years) >= $${filterParams.length}`);
  }

  const where = filterConditions.join(" AND ");

  // Hybrid search: combines vector similarity with text matching
  // - vector_score: semantic similarity (0-1)
  // - text_match: bonus for direct text matches in summary/parsed content
  // - skill_match: bonus for matching skills
  const hybridSql = `
    WITH scored AS (
      SELECT
        c.id AS candidate_id,
        1 - (cp.embedding <=> $1::vector) AS vector_score,
        CASE 
          WHEN cp.summary ILIKE '%' || $2 || '%' THEN 0.3
          WHEN cp.parsed_json::text ILIKE '%' || $2 || '%' THEN 0.2
          ELSE 0
        END AS text_bonus,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM candidate_skills cs 
            WHERE cs.candidate_id = c.id 
            AND (cs.skill ILIKE '%' || $2 || '%' OR cs.skill_normalized % lower($2))
          ) THEN 0.2
          ELSE 0
        END AS skill_bonus
      FROM candidate_profiles cp
      JOIN candidates c ON c.id = cp.candidate_id
      WHERE ${where}
    ),
    ranked AS (
      SELECT 
        candidate_id,
        vector_score,
        text_bonus,
        skill_bonus,
        (vector_score + text_bonus + skill_bonus) AS combined_score
      FROM scored
      WHERE vector_score >= ${MIN_VECTOR_SCORE} OR text_bonus > 0 OR skill_bonus > 0
      ORDER BY combined_score DESC
      LIMIT 200
    )
    SELECT ${SELECT_COLS},
           r.vector_score,
           r.combined_score
    FROM ranked r
    JOIN candidates c ON c.id = r.candidate_id
    LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE
    ORDER BY r.combined_score DESC
    LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}
  `;

  const countSql = `
    WITH scored AS (
      SELECT
        c.id AS candidate_id,
        1 - (cp.embedding <=> $1::vector) AS vector_score,
        CASE 
          WHEN cp.summary ILIKE '%' || $2 || '%' THEN 0.3
          WHEN cp.parsed_json::text ILIKE '%' || $2 || '%' THEN 0.2
          ELSE 0
        END AS text_bonus,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM candidate_skills cs 
            WHERE cs.candidate_id = c.id 
            AND (cs.skill ILIKE '%' || $2 || '%' OR cs.skill_normalized % lower($2))
          ) THEN 0.2
          ELSE 0
        END AS skill_bonus
      FROM candidate_profiles cp
      JOIN candidates c ON c.id = cp.candidate_id
      WHERE ${where}
    )
    SELECT COUNT(*) AS count
    FROM scored
    WHERE vector_score >= ${MIN_VECTOR_SCORE} OR text_bonus > 0 OR skill_bonus > 0
  `;

  const [rows, countRows] = await Promise.all([
    query<CandidateRow & { vector_score: number; combined_score: number }>(hybridSql, [...filterParams, limit, offset]),
    query<{ count: string }>(countSql, filterParams),
  ]);

  const total = parseInt(countRows[0]?.count || "0");

  return {
    rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    isVectorSearch: true,
  };
}

async function getCandidatesFallback(
  q: string,
  sp: ResolvedSP
): Promise<{ rows: CandidateRow[]; total: number; page: number; totalPages: number }> {
  const availability = sp.availability || "";
  const contract = sp.contract === "true";
  const minExp = sp.min_experience ? parseInt(sp.min_experience) : null;
  const page = Math.max(1, parseInt(sp.page || "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["c.status != 'deleted'"];
  const params: unknown[] = [];

  if (q) {
    params.push(q);
    conditions.push(
      `(c.full_name ILIKE '%' || $${params.length} || '%'
        OR c.primary_email ILIKE '%' || $${params.length} || '%'
        OR c.headline ILIKE '%' || $${params.length} || '%'
        OR c.full_name % $${params.length}
        OR EXISTS (
          SELECT 1 FROM candidate_skills cs
          WHERE cs.candidate_id = c.id AND (
            cs.skill ILIKE '%' || $${params.length} || '%'
            OR cs.skill_normalized % lower($${params.length})
          )
        ))`
    );
  }

  if (availability) {
    params.push(availability);
    conditions.push(`c.availability_status = $${params.length}`);
  }
  if (contract) {
    conditions.push("c.open_to_contract = TRUE");
  }
  if (minExp !== null) {
    params.push(minExp);
    conditions.push(`COALESCE(cp.total_experience_years, c.total_experience_years) >= $${params.length}`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const [rows, countRows] = await Promise.all([
    query<CandidateRow>(
      `SELECT ${SELECT_COLS}
       FROM candidates c
       LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE
       ${where}
       ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(DISTINCT c.id) AS count FROM candidates c
       LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE
       ${where}`,
      params
    ),
  ]);

  return {
    rows,
    total: parseInt(countRows[0]?.count || "0"),
    page,
    totalPages: Math.ceil(parseInt(countRows[0]?.count || "0") / limit),
  };
}

async function getCandidates(sp: ResolvedSP): Promise<{
  rows: CandidateRow[]; total: number; page: number; totalPages: number; isVectorSearch: boolean;
}> {
  const q = sp.q?.trim() || "";

  if (q) {
    return getCandidatesHybridSearch(q, sp);
  }

  return { ...(await getCandidatesFallback("", sp)), isVectorSearch: false };
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { rows, total, page, totalPages, isVectorSearch } = await getCandidates(sp);
  const hasFilters = !!(sp.q || sp.availability || sp.contract || sp.min_experience);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Candidate Pool</h1>
          <p className="section-subtitle">
            {total} {hasFilters ? "matching" : "total"} candidates
            {isVectorSearch && sp.q && (
              <span className="ml-2 text-xs font-normal text-text-muted bg-bg-hover px-1.5 py-0.5 rounded">
                semantic search
              </span>
            )}
          </p>
        </div>
      </div>

      <CandidateFilters
        initialQ={sp.q}
        initialAvailability={sp.availability}
        initialContract={sp.contract === "true"}
        initialMinExp={sp.min_experience}
      />

      <div className="card overflow-hidden mt-4">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-tertiary/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden lg:table-cell">Skills</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wide">Availability</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wide hidden md:table-cell">Last active</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-bg-hover flex items-center justify-center">
                        <Users className="w-5 h-5 text-text-muted" />
                      </div>
                      <p className="text-sm text-text-muted">
                        {hasFilters ? "No candidates match your filters." : "No candidates yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const skills = c.raw_skills ? c.raw_skills.split(",").filter(Boolean).slice(0, 5) : [];
                  const name = c.full_name || c.primary_email || "Unknown";
                  return (
                    <tr key={c.id} className="table-row-hover">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/candidates/${c.id}`} className="flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 text-primary text-xs font-bold font-display">
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-light group-hover:text-primary transition-colors truncate">
                              {name}
                            </p>
                            {c.current_title ? (
                              <p className="text-xs text-text-muted truncate">
                                {c.current_title}{c.current_company ? ` · ${c.current_company}` : ""}
                              </p>
                            ) : c.primary_email ? (
                              <p className="text-xs text-text-muted truncate">{c.primary_email}</p>
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
                        <span className={availabilityBadgeClass(c.availability_status)}>
                          {c.availability_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right hidden md:table-cell">
                        <span className="text-xs text-text-muted">
                          {c.last_active_at ? formatRelativeTime(c.last_active_at) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <DeleteButton
                          endpoint={`/api/admin/candidates/${c.id}`}
                          entityLabel={name}
                          confirmMessage={`Delete ${name}? Their CV, skills, and application history will be permanently removed.`}
                          redirectTo="/admin/candidates"
                        />
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
              No candidates{hasFilters ? " match your filters" : " yet"}.
            </div>
          ) : (
            rows.map((c) => {
              const skills = c.raw_skills ? c.raw_skills.split(",").filter(Boolean).slice(0, 3) : [];
              const name = c.full_name || c.primary_email || "Unknown";
              return (
                <div key={c.id} className="flex items-center gap-2 px-4 py-3.5 table-row-hover">
                  <Link href={`/admin/candidates/${c.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 text-primary text-xs font-bold font-display">
                      {getInitials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-light truncate">{name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={availabilityBadgeClass(c.availability_status)}>
                          {c.availability_status}
                        </span>
                        {skills.slice(0, 2).map((s) => (
                          <span key={s} className="badge badge-gray">{s}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  </Link>
                  <DeleteButton
                    endpoint={`/api/admin/candidates/${c.id}`}
                    entityLabel={name}
                    confirmMessage={`Delete ${name}? Their CV, skills, and application history will be permanently removed.`}
                    redirectTo="/admin/candidates"
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination */}
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
