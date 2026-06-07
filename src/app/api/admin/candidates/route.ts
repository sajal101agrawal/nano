import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";
import type { ApiResponse, PaginatedResult } from "@/types";

export interface CandidateListItem {
  id: string;
  full_name: string | null;
  primary_email: string | null;
  headline: string | null;
  source: string;
  availability_status: string;
  open_to_contract: boolean | null;
  total_experience_years: number | null;
  last_active_at: string | null;
  created_at: string;
  skills: string[];
  vector_score?: number;
}

const CANDIDATE_COLS = `
  c.id, c.full_name, c.primary_email, c.headline, c.source,
  c.availability_status, c.open_to_contract, c.total_experience_years,
  c.last_active_at, c.created_at,
  COALESCE(
    (SELECT json_agg(cs.skill ORDER BY cs.years DESC NULLS LAST)
     FROM (
       SELECT skill, years FROM candidate_skills
       WHERE candidate_id = c.id
       ORDER BY years DESC NULLS LAST
       LIMIT 5
     ) cs),
    '[]'
  )::text AS raw_skills
`;

// Minimum cosine similarity threshold for vector search results (0-1 scale)
// OpenAI embeddings typically produce lower scores (10-30%) for query-to-document matching
// 0.1 filters out only the most irrelevant candidates while keeping reasonable matches
const MIN_VECTOR_SCORE = 0.1;

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();

    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() || "";
    const availability = searchParams.get("availability") || "";
    const contract = searchParams.get("contract");
    const minExp = searchParams.get("min_experience");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const buildFilterConditions = (params: unknown[], baseConditions: string[]) => {
      if (availability && availability !== "all") {
        params.push(availability);
        baseConditions.push(`c.availability_status = $${params.length}`);
      }
      if (contract === "true") {
        baseConditions.push(`c.open_to_contract = TRUE`);
      }
      if (minExp) {
        const exp = parseInt(minExp);
        if (!isNaN(exp)) {
          params.push(exp);
          baseConditions.push(`c.total_experience_years >= $${params.length}`);
        }
      }
    };

    if (q) {
      // Try vector search first
      try {
        const embedding = await generateEmbedding(q);
        const vectorStr = `[${embedding.join(",")}]`;

        const vecParams: unknown[] = [vectorStr];
        const vecConditions: string[] = ["c.status != 'deleted'", "cp.is_current = TRUE"];
        buildFilterConditions(vecParams, vecConditions);

        const vecWhere = vecConditions.join(" AND ");

        const [rows, countRows] = await Promise.all([
          query<CandidateListItem & { raw_skills: string; vector_score: number }>(
            `WITH ranked AS (
               SELECT c.id AS candidate_id,
                      1 - (cp.embedding <=> $1::vector) AS vector_score
               FROM candidate_profiles cp
               JOIN candidates c ON c.id = cp.candidate_id
               WHERE ${vecWhere}
               ORDER BY cp.embedding <=> $1::vector
               LIMIT 200
             )
             SELECT ${CANDIDATE_COLS}, r.vector_score
             FROM ranked r
             JOIN candidates c ON c.id = r.candidate_id
             LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id AND cp.is_current = TRUE
             WHERE r.vector_score >= ${MIN_VECTOR_SCORE}
             ORDER BY r.vector_score DESC
             LIMIT $${vecParams.length + 1} OFFSET $${vecParams.length + 2}`,
            [...vecParams, limit, offset]
          ),
          query<{ count: string }>(
            `WITH ranked AS (
               SELECT c.id AS candidate_id,
                      1 - (cp.embedding <=> $1::vector) AS vector_score
               FROM candidate_profiles cp
               JOIN candidates c ON c.id = cp.candidate_id
               WHERE ${vecWhere}
               ORDER BY cp.embedding <=> $1::vector
               LIMIT 200
             )
             SELECT COUNT(*) AS count
             FROM ranked
             WHERE vector_score >= ${MIN_VECTOR_SCORE}`,
            vecParams
          ),
        ]);

        const total = parseInt(countRows[0]?.count || "0");
        const data: CandidateListItem[] = rows.map((r) => ({
          ...r,
          skills: (() => {
            try { return JSON.parse(r.raw_skills || "[]") as string[]; } catch { return []; }
          })(),
        }));

        const result: PaginatedResult<CandidateListItem> = {
          data, total, page, limit, totalPages: Math.ceil(total / limit),
        };
        return NextResponse.json<ApiResponse<PaginatedResult<CandidateListItem>>>({ success: true, data: result });
      } catch {
        // fall through to keyword search
      }
    }

    // Keyword / no-query path
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

    buildFilterConditions(params, conditions);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      query<CandidateListItem & { raw_skills: string }>(
        `SELECT ${CANDIDATE_COLS}
         FROM candidates c
         ${where}
         ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM candidates c ${where}`,
        params
      ),
    ]);

    const total = parseInt(countRows[0]?.count || "0");

    const data: CandidateListItem[] = rows.map((r) => ({
      ...r,
      skills: (() => {
        try {
          return JSON.parse(r.raw_skills || "[]") as string[];
        } catch {
          return [];
        }
      })(),
    }));

    const result: PaginatedResult<CandidateListItem> = {
      data, total, page, limit, totalPages: Math.ceil(total / limit),
    };

    return NextResponse.json<ApiResponse<PaginatedResult<CandidateListItem>>>({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
