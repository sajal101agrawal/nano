import { query } from "@/lib/db";
import Link from "next/link";
import { MapPin, Clock, ArrowRight, Briefcase } from "lucide-react";

export const dynamic = "force-dynamic";

function engagementLabel(type: string) {
  return type === "contract" ? "Contract" : type === "fulltime" ? "Full-time" : "Contract / Full-time";
}

function workModeLabel(mode: string) {
  return { remote: "Remote", onsite: "On-site", hybrid: "Hybrid", flexible: "Flexible" }[mode] || mode;
}

export default async function JobsPage() {
  const jobs = await query<{
    id: string; title: string; engagement_type: string; work_mode: string;
    location: string; public_slug: string; application_count: string; created_at: string;
  }>(
    `SELECT r.id, r.title, r.engagement_type, r.work_mode, r.location, r.public_slug, r.created_at,
            COUNT(a.id) AS application_count
     FROM requirements r
     LEFT JOIN applications a ON a.requirement_id = r.id
     WHERE r.status = 'open'
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-bg/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
              <span className="font-display font-black text-sm text-white leading-none">N</span>
            </div>
            <span className="font-display font-bold text-text-light text-[15px]">Nano</span>
            <span className="text-text-muted text-xs hidden sm:inline">by Sajal Tech</span>
          </Link>
          <span className="text-xs text-text-muted">{jobs.length} open role{jobs.length !== 1 ? "s" : ""}</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-text-light tracking-tight">
            Open Positions
          </h1>
          <p className="text-text-dim mt-2 text-[15px]">
            We're looking for talented engineers and builders. Apply in under 2 minutes.
          </p>
        </div>

        {jobs.length === 0 ? (
          <div className="card py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-bg-tertiary flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-5 h-5 text-text-muted" />
            </div>
            <h2 className="font-display text-lg font-semibold text-text-light mb-2">No open roles right now</h2>
            <p className="text-text-dim text-sm max-w-xs mx-auto">
              We're always looking for great people. Check back soon or reach out directly.
            </p>
            <a
              href="mailto:contact@sajaltech.com"
              className="btn btn-secondary btn-sm mt-5 inline-flex"
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
                className="card card-interactive block group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[17px] font-semibold text-text-light group-hover:text-primary transition-colors">
                      {job.title}
                    </h2>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="badge badge-indigo">{engagementLabel(job.engagement_type)}</span>
                      {job.work_mode && (
                        <span className="badge badge-blue">{workModeLabel(job.work_mode)}</span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 mt-0.5">
                    <span className="text-xs text-text-muted hidden sm:flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {parseInt(job.application_count)} applied
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-bg-hover group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
