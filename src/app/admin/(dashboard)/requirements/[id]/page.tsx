import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import Link from "next/link";
import RequirementDetail from "./RequirementDetail";
import { requirementStatusBadgeClass, formatDate } from "@/lib/cn";
import { matchQueue } from "@/lib/queue";
import type { Requirement, RequirementQuestion, Application, Match } from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await queryOne<{ title: string }>(
    "SELECT title FROM requirements WHERE id = $1",
    [id]
  );
  return { title: req ? `${req.title} — Nano` : "Requirement" };
}

type ApplicationWithCandidate = Application & {
  candidate_name: string;
  candidate_email: string;
  candidate_availability: string;
  candidate_headline: string;
};

type MatchWithCandidate = Match & {
  candidate_name: string;
  candidate_email: string;
  candidate_headline: string;
  candidate_availability: string;
  open_to_contract: boolean;
  skills: string[];
};

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminSession();

  const requirement = await queryOne<Requirement & { client_name?: string }>(
    `SELECT r.*, c.company_name AS client_name
     FROM requirements r
     LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.id = $1`,
    [id]
  );

  if (!requirement) notFound();

  const [questions, applications, matches] = await Promise.all([    query<RequirementQuestion>(
      "SELECT * FROM requirement_questions WHERE requirement_id = $1 ORDER BY sort_order",
      [id]
    ),
    query<ApplicationWithCandidate>(
      `SELECT a.*,
              COALESCE(c.full_name, c.primary_email, 'Unknown') AS candidate_name,
              COALESCE(c.primary_email, '') AS candidate_email,
              c.availability_status AS candidate_availability,
              COALESCE(c.headline, '') AS candidate_headline
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.requirement_id = $1
       ORDER BY a.applied_at DESC`,
      [id]
    ),
    query<MatchWithCandidate>(
      `SELECT m.*,
              COALESCE(c.full_name, c.primary_email, 'Unknown') AS candidate_name,
              COALESCE(c.primary_email, '') AS candidate_email,
              COALESCE(c.headline, '') AS candidate_headline,
              c.availability_status AS candidate_availability,
              COALESCE(c.open_to_contract, FALSE) AS open_to_contract,
              COALESCE(
                array_to_json(ARRAY(
                  SELECT cs.skill FROM candidate_skills cs
                  WHERE cs.candidate_id = c.id
                  ORDER BY cs.years DESC NULLS LAST LIMIT 6
                ))::text, '[]'
              ) AS raw_skills
       FROM matches m
       JOIN candidates c ON c.id = m.candidate_id
       WHERE m.requirement_id = $1
       ORDER BY m.score DESC NULLS LAST`,
      [id]
    ).then((rows) =>
      rows.map((r) => ({
        ...r,
        skills: (() => {
          try {
            return JSON.parse(
              (r as MatchWithCandidate & { raw_skills: string }).raw_skills || "[]"
            ) as string[];
          } catch {
            return [];
          }
        })(),
      }))
    ),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = `${appUrl}/jobs/${requirement.public_slug}`;

  // Check if a match job is currently queued/active
  const matchJobId = `match-${id}`;
  const existingMatchJob = await matchQueue.getJob(matchJobId).catch(() => null);
  let matchJobQueued = false;
  if (existingMatchJob) {
    const state = await existingMatchJob.getState().catch(() => "unknown");
    matchJobQueued = state === "waiting" || state === "active" || state === "delayed";
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-text-dim">
        <Link href="/admin/requirements" className="hover:text-text-light transition-colors">
          Requirements
        </Link>
        <span className="text-text-dim/40">/</span>
        <span className="truncate max-w-xs">{requirement.title}</span>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-text-light leading-tight">
            {requirement.title}
          </h1>
          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            <span className={requirementStatusBadgeClass(requirement.status)}>
              {requirement.status.replace(/_/g, " ")}
            </span>
            {requirement.client_name && (
              <span className="text-sm text-text-dim">{requirement.client_name}</span>
            )}
            {requirement.work_mode && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-bg-hover border border-border text-xs text-text-dim capitalize">
                {requirement.work_mode}
              </span>
            )}
            {requirement.engagement_type && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-bg-hover border border-border text-xs text-text-dim capitalize">
                {requirement.engagement_type}
              </span>
            )}
            <span className="text-xs text-text-dim">
              Posted {formatDate(requirement.created_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold text-text-light tabular-nums">
              {applications.length}
            </p>
            <p className="text-xs text-text-dim">
              {applications.length === 1 ? "application" : "applications"}
            </p>
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Public page
          </a>
        </div>
      </div>

      {/* Detail client component with tabs */}
      <RequirementDetail
        requirement={requirement}
        questions={questions}
        applications={applications}
        matches={matches}
        publicUrl={publicUrl}
        initialMatchQueued={matchJobQueued}
      />
    </div>
  );
}
