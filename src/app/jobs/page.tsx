import { query } from "@/lib/db";
import Link from "next/link";
import Image from "next/image";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers — Sajal Tech",
  description: "Join our team. Browse open positions and apply in under 2 minutes.",
};

function engagementLabel(type: string) {
  return type === "contract" ? "Contract" : type === "fulltime" ? "Full-time" : "Contract / Full-time";
}

function workModeLabel(mode: string) {
  return { remote: "Remote", onsite: "On-site", hybrid: "Hybrid", flexible: "Flexible" }[mode] || mode;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function JobsPage() {
  const jobs = await query<{
    id: string; title: string; engagement_type: string; work_mode: string;
    location: string; public_slug: string; created_at: string;
  }>(
    `SELECT r.id, r.title, r.engagement_type, r.work_mode, r.location, r.public_slug, r.created_at
     FROM requirements r
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC`
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-bg/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <a href="https://sajaltech.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 group">
            <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-7 w-auto" priority />
            <span className="text-text-muted text-[11px] leading-tight">Careers</span>
          </a>
        </div>
      </header>

      {/* Hero section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-[0.04]"
            style={{ background: "radial-gradient(ellipse at center, var(--color-primary) 0%, transparent 70%)" }}
          />
        </div>
        <div className="max-w-2xl mx-auto px-5 sm:px-6 pt-12 pb-8 relative">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-text-light tracking-tight">
            Open Positions
          </h1>
          <p className="text-text-dim mt-3 text-[15px] leading-relaxed max-w-md">
            We build software for ambitious companies. Find your next role and apply in under 2 minutes.
          </p>
        </div>
      </div>

      {/* Jobs list */}
      <main className="max-w-2xl mx-auto px-5 sm:px-6 pb-16">
        {jobs.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-bg-secondary border border-border flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-text-light mb-2">No open roles right now</h2>
            <p className="text-text-dim text-sm max-w-xs mx-auto mb-6">
              We are always looking for great people. Check back soon or reach out directly.
            </p>
            <a
              href="mailto:careers@sajaltech.com"
              className="btn btn-secondary btn-sm inline-flex"
            >
              Get in touch
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.public_slug}`}
                className="block group"
              >
                <div className="bg-bg-secondary border border-border rounded-xl p-5 transition-all duration-200 hover:border-border-hover hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-[16px] font-semibold text-text-light group-hover:text-primary transition-colors tracking-tight">
                        {job.title}
                      </h2>
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        <span className="inline-flex items-center rounded-full bg-primary/[0.08] text-primary text-[11px] font-medium px-2.5 py-0.5">
                          {engagementLabel(job.engagement_type)}
                        </span>
                        {job.work_mode && (
                          <span className="inline-flex items-center rounded-full bg-bg-tertiary text-text-dim text-[11px] font-medium px-2.5 py-0.5">
                            {workModeLabel(job.work_mode)}
                          </span>
                        )}
                        {job.location && (
                          <span className="flex items-center gap-1 text-[11px] text-text-muted">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {job.location}
                          </span>
                        )}
                        <span className="text-[11px] text-text-muted">{timeAgo(job.created_at)}</span>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-bg-hover group-hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0 mt-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted group-hover:text-primary transition-colors">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-5 sm:px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Image src="/logo.png" alt="Sajal Tech" width={80} height={27} className="h-5 w-auto opacity-60" />
          <a
            href="https://sajaltech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text-muted hover:text-primary transition-colors"
          >
            sajaltech.com
          </a>
        </div>
      </footer>
    </div>
  );
}
