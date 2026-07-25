import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";
import { formatDate } from "@/lib/cn";
import Link from "next/link";

type ApplicationStatusRow = {
  id: string;
  status: string;
  applied_at: string;
  candidate_name: string;
  requirement_title: string;
  company_name: string | null;
  work_mode: string | null;
  location: string | null;
};

const STATUS_INFO: Record<string, { label: string; description: string; color: string }> = {
  applied: {
    label: "Application Received",
    description: "Your application has been received and is currently under review.",
    color: "text-blue-400",
  },
  shortlisted: {
    label: "Shortlisted",
    description: "Good news! You've been shortlisted for this position. We'll be in touch soon.",
    color: "text-purple-400",
  },
  contacted: {
    label: "Recruiter Contacted",
    description: "A recruiter has reached out to you. Please check your email.",
    color: "text-violet-400",
  },
  in_discussion: {
    label: "In Discussion",
    description: "You're currently in the interview process. Keep going!",
    color: "text-amber-400",
  },
  offered: {
    label: "Offer Extended",
    description: "An offer has been extended for this position. Please check your email.",
    color: "text-orange-400",
  },
  placed: {
    label: "Placement Confirmed",
    description: "Congratulations! Your placement has been confirmed.",
    color: "text-emerald-400",
  },
  rejected: {
    label: "Application Closed",
    description: "Unfortunately, your application was not selected for this role. We encourage you to apply for other positions.",
    color: "text-gray-400",
  },
  withdrawn: {
    label: "Application Withdrawn",
    description: "This application has been withdrawn.",
    color: "text-gray-400",
  },
};

const STEPS = ["applied", "shortlisted", "contacted", "in_discussion", "offered", "placed"];

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await queryOne<{ requirement_title: string }>(
    `SELECT r.title AS requirement_title
     FROM applications a JOIN requirements r ON r.id = a.requirement_id
     WHERE a.status_token = $1`,
    [token]
  );
  return { title: app ? `Application Status — ${app.requirement_title}` : "Application Status" };
}

export default async function ApplicationStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const app = await queryOne<ApplicationStatusRow>(
    `SELECT a.id, a.status, a.applied_at,
            COALESCE(c.full_name, 'Candidate') AS candidate_name,
            r.title AS requirement_title,
            cl.company_name,
            r.work_mode,
            r.location
     FROM applications a
     JOIN candidates c ON c.id = a.candidate_id
     JOIN requirements r ON r.id = a.requirement_id
     LEFT JOIN clients cl ON cl.id = r.client_id
     WHERE a.status_token = $1`,
    [token]
  );

  if (!app) notFound();

  const statusInfo = STATUS_INFO[app.status] || STATUS_INFO.applied;
  const currentStep = STEPS.indexOf(app.status);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="rounded-2xl border border-border bg-bg-secondary overflow-hidden shadow-xl">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-border">
            <p className="text-xs font-medium text-text-dim uppercase tracking-widest mb-1">Application Status</p>
            <h1 className="font-display text-xl font-bold text-text-light">{app.requirement_title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {app.company_name && <span className="text-sm text-text-dim">{app.company_name}</span>}
              {app.work_mode && <span className="text-xs text-text-dim capitalize bg-bg-hover border border-border rounded px-2 py-0.5">{app.work_mode}</span>}
              {app.location && <span className="text-xs text-text-dim">{app.location}</span>}
            </div>
          </div>

          {/* Status */}
          <div className="px-8 py-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-bg-hover border border-border flex items-center justify-center shrink-0">
                <span className={`text-xl ${statusInfo.color}`}>
                  {app.status === "placed" ? "🎉" : app.status === "rejected" ? "📋" : app.status === "offered" ? "📨" : "📍"}
                </span>
              </div>
              <div>
                <h2 className={`font-semibold text-base ${statusInfo.color}`}>{statusInfo.label}</h2>
                <p className="text-sm text-text-dim mt-1 leading-relaxed">{statusInfo.description}</p>
              </div>
            </div>
          </div>

          {/* Progress steps (only for active pipeline statuses) */}
          {!["rejected", "withdrawn"].includes(app.status) && (
            <div className="px-8 pb-6">
              <div className="flex items-center gap-1">
                {STEPS.map((step, idx) => {
                  const done = idx <= currentStep;
                  const active = idx === currentStep;
                  return (
                    <div key={step} className="flex items-center flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 transition-all ${done ? "bg-primary text-white" : "bg-bg-hover border border-border text-text-muted"} ${active ? "ring-2 ring-primary/30" : ""}`}>
                        {done && idx < currentStep ? "✓" : idx + 1}
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-1 ${idx < currentStep ? "bg-primary" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                {STEPS.map((step) => (
                  <span key={step} className="text-[9px] text-text-muted capitalize text-center" style={{ width: `${100 / STEPS.length}%` }}>
                    {step.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 pb-8 border-t border-border pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-dim">Applied {formatDate(app.applied_at)}</p>
              <p className="text-xs text-text-muted">Hi, {app.candidate_name}</p>
            </div>
            <Link href="/jobs" className="text-xs text-primary hover:underline">Browse more jobs</Link>
          </div>
        </div>

        <p className="text-center text-xs text-text-dim/50 mt-4">
          This page is automatically updated when your application status changes.
        </p>
      </div>
    </div>
  );
}
