import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
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
}

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

    const conditions: string[] = ["c.status != 'deleted'"];
    const params: unknown[] = [];

    if (q) {
      params.push(q);
      conditions.push(
        `(c.full_name ILIKE $${params.length} OR c.primary_email ILIKE $${params.length} OR EXISTS (
          SELECT 1 FROM candidate_skills cs
          WHERE cs.candidate_id = c.id
            AND cs.skill_normalized % lower($${params.length})
        ) OR c.full_name % $${params.length} OR c.headline ILIKE $${params.length})`
      );
    }

    if (availability && availability !== "all") {
      params.push(availability);
      conditions.push(`c.availability_status = $${params.length}`);
    }

    if (contract === "true") {
      conditions.push(`c.open_to_contract = TRUE`);
    }

    if (minExp) {
      const exp = parseInt(minExp);
      if (!isNaN(exp)) {
        params.push(exp);
        conditions.push(`c.total_experience_years >= $${params.length}`);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      query<CandidateListItem & { raw_skills: string }>(
        `SELECT
           c.id,
           c.full_name,
           c.primary_email,
           c.headline,
           c.source,
           c.availability_status,
           c.open_to_contract,
           c.total_experience_years,
           c.last_active_at,
           c.created_at,
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
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return NextResponse.json<ApiResponse<PaginatedResult<CandidateListItem>>>({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
