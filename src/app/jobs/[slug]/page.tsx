import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { query, queryOne } from "@/lib/db";
import type { Requirement, RequirementQuestion } from "@/types";
import ApplicationFlow from "./ApplicationFlow";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const req = await queryOne<Requirement & { client_name?: string }>(
    `SELECT r.*, c.company_name AS client_name
     FROM requirements r LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.public_slug = $1 AND r.status = 'open'`,
    [slug]
  );
  if (!req) return { title: "Position Not Available — Sajal Tech Careers" };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const description = [
    `${req.engagement_type === "contract" ? "Contract" : req.engagement_type === "fulltime" ? "Full-time" : "Contract/Full-time"} position`,
    req.work_mode && `· ${req.work_mode}`,
    req.location && `in ${req.location}`,
    "· Quick application, no login required.",
  ].filter(Boolean).join(" ");
  return {
    title: `${req.title} — Sajal Tech Careers`,
    description,
    openGraph: {
      title: `${req.title}`,
      description,
      url: `${appUrl}/jobs/${req.public_slug}`,
      type: "website",
    },
    twitter: { card: "summary", title: req.title, description },
  };
}

function engagementLabel(type: Requirement["engagement_type"]): string {
  const map: Record<string, string> = {
    contract: "Contract",
    fulltime: "Full-time",
    both: "Contract / Full-time",
  };
  return map[type] ?? type;
}

function workModeLabel(mode?: string): string {
  if (!mode) return "";
  const map: Record<string, string> = {
    remote: "Remote",
    onsite: "On-site",
    hybrid: "Hybrid",
    flexible: "Flexible",
  };
  return map[mode] ?? mode;
}

export default async function JobDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const req = await queryOne<Requirement>(
    "SELECT * FROM requirements WHERE public_slug = $1 AND status = 'open'",
    [slug]
  );

  if (!req) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-5 sm:px-6 h-16 flex items-center">
            <Link href="/jobs" className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-7 w-auto" priority />
              <span className="text-text-muted text-[11px] leading-tight">Careers</span>
            </Link>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-5 py-16">
          <div className="text-center max-w-sm animate-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-bg-secondary border border-border flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="font-display text-xl font-bold text-text-light tracking-tight mb-2">
              Position Closed
            </h1>
            <p className="text-text-dim text-sm mb-6 leading-relaxed">
              This role has been filled or is no longer accepting applications.
            </p>
            <Link href="/jobs" className="btn btn-secondary inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Browse open positions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [questions, similarJobs] = await Promise.all([
    query<RequirementQuestion>(
      "SELECT * FROM requirement_questions WHERE requirement_id = $1 ORDER BY sort_order ASC",
      [req.id]
    ),
    query<{ id: string; title: string; public_slug: string; work_mode: string | null; engagement_type: string }>(
      `SELECT id, title, public_slug, work_mode, engagement_type
       FROM requirements
       WHERE status = 'open' AND id != $1
       ORDER BY created_at DESC LIMIT 3`,
      [req.id]
    ),
  ]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/jobs" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-7 w-auto" priority />
            <span className="text-text-muted text-[11px] leading-tight">Careers</span>
          </Link>
          <Link
            href="/jobs"
            className="flex items-center gap-1.5 text-[13px] text-text-dim hover:text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            All positions
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        {/* Job info */}
        <div className="mb-8 animate-fade-up">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full bg-primary/[0.08] text-primary text-[11px] font-medium px-2.5 py-0.5">
              {engagementLabel(req.engagement_type)}
            </span>
            {req.work_mode && (
              <span className="inline-flex items-center rounded-full bg-bg-tertiary text-text-dim text-[11px] font-medium px-2.5 py-0.5">
                {workModeLabel(req.work_mode)}
              </span>
            )}
            {req.location && (
              <span className="flex items-center gap-1 text-[11px] text-text-muted">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {req.location}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-light tracking-tight">
            {req.title}
          </h1>
        </div>

        {/* Application section — shown first */}
        <div className="animate-fade-up" style={{ animationDelay: "50ms" }}>
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <h2 className="font-display text-lg font-semibold text-text-light tracking-tight">
                Apply now
              </h2>
            </div>
            <ApplicationFlow requirement={req} questions={questions} />
          </div>
        </div>

        {/* Job description — shown below the apply form */}
        {req.jd_raw && (
          <div className="border-t border-border pt-8 animate-fade-up" style={{ animationDelay: "100ms" }}>
            <h2 className="font-display text-base font-semibold text-text-light mb-4">About this role</h2>

            {(req.required_skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {req.required_skills!.map((s) => (
                  <span
                    key={s}
                    className="text-[11px] text-primary/80 bg-primary/[0.06] border border-primary/[0.12] rounded-full px-2.5 py-0.5 font-medium"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            <div className="bg-bg-secondary border border-border rounded-xl p-5 sm:p-6 max-h-[60vh] overflow-y-auto">
              <div className="prose-jd">
                {req.jd_raw.split("\n").map((line, i) => {
                  const trimmed = line.trim();
                  if (!trimmed) return <div key={i} className="h-2.5" />;
                  if (trimmed.startsWith("##")) {
                    return <h2 key={i}>{trimmed.replace(/^##\s*/, "")}</h2>;
                  }
                  if (trimmed.startsWith("#")) {
                    return <h1 key={i}>{trimmed.replace(/^#\s*/, "")}</h1>;
                  }
                  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                    return (
                      <li key={i}><span>{trimmed.slice(2)}</span></li>
                    );
                  }
                  return <p key={i}>{line}</p>;
                })}
              </div>
            </div>
          </div>
        )}
        {/* Similar Jobs */}
        {similarJobs.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border animate-fade-up" style={{ animationDelay: "400ms" }}>
            <h2 className="font-display text-base font-semibold text-text-light mb-4">Other Open Positions</h2>
            <div className="space-y-2">
              {similarJobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.public_slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-bg-secondary hover:border-primary/30 hover:bg-primary/3 transition-all group">
                  <span className="text-sm font-medium text-text-light group-hover:text-primary transition-colors">{job.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.work_mode && <span className="text-xs text-text-muted capitalize">{job.work_mode}</span>}
                    <svg className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
