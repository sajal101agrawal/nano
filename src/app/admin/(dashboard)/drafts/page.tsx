import { query } from "@/lib/db";
import Link from "next/link";
import { FileText, Clock, Mail, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function stepLabel(step: string): string {
  const map: Record<string, string> = {
    upload: "CV Uploaded",
    details: "Awaiting Details",
    preferences: "Awaiting Preferences",
    submitting: "Submitting",
  };
  return map[step] || step;
}

export default async function AdminDraftsPage() {
  const drafts = await query<{
    id: string;
    requirement_id: string;
    cv_filename: string;
    parsed_name: string | null;
    parsed_email: string | null;
    candidate_name: string | null;
    candidate_email: string | null;
    step: string;
    status: string;
    reminder_sent_15m: boolean;
    reminder_sent_6h: boolean;
    created_at: string;
    updated_at: string;
    req_title: string;
    req_slug: string;
  }>(
    `SELECT d.id, d.requirement_id, d.cv_filename,
            d.parsed_name, d.parsed_email, d.candidate_name, d.candidate_email,
            d.step, d.status, d.reminder_sent_15m, d.reminder_sent_6h,
            d.created_at, d.updated_at,
            r.title AS req_title, r.public_slug AS req_slug
     FROM draft_applications d
     JOIN requirements r ON r.id = d.requirement_id
     ORDER BY d.created_at DESC
     LIMIT 100`
  );

  const activeDrafts = drafts.filter((d) => d.status === "draft");
  const completedDrafts = drafts.filter((d) => d.status === "completed");
  const expiredDrafts = drafts.filter((d) => d.status === "expired");

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Incomplete Applications</h1>
          <p className="section-subtitle">
            {activeDrafts.length} active draft{activeDrafts.length !== 1 ? "s" : ""}, {completedDrafts.length} completed, {expiredDrafts.length} expired
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">Active Drafts</p>
          <p className="text-2xl font-bold text-text-light">{activeDrafts.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">Converted</p>
          <p className="text-2xl font-bold text-emerald-500">{completedDrafts.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">Expired</p>
          <p className="text-2xl font-bold text-text-muted">{expiredDrafts.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">Conversion Rate</p>
          <p className="text-2xl font-bold text-primary">
            {drafts.length > 0 ? Math.round((completedDrafts.length / drafts.length) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Active drafts table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-tertiary/50 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-text-light">Active Drafts</span>
          <span className="text-xs text-text-muted ml-1">({activeDrafts.length})</span>
        </div>

        {activeDrafts.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="w-8 h-8 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-dim">No incomplete applications right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide">Candidate</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide">Position</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide">Step</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide">Reminders</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeDrafts.map((d) => (
                  <tr key={d.id} className="table-row-hover">
                    <td className="px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-text-light">
                          {d.candidate_name || d.parsed_name || "Unknown"}
                        </p>
                        <p className="text-xs text-text-muted">
                          {d.candidate_email || d.parsed_email || "No email"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-text-dim">{d.req_title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge badge-amber badge-dot">{stepLabel(d.step)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {d.reminder_sent_15m && (
                          <span className="inline-flex items-center gap-1 text-xs text-text-muted" title="15-min reminder sent">
                            <Mail className="w-3 h-3" /> 15m
                          </span>
                        )}
                        {d.reminder_sent_6h && (
                          <span className="inline-flex items-center gap-1 text-xs text-text-muted" title="6-hour reminder sent">
                            <Mail className="w-3 h-3" /> 6h
                          </span>
                        )}
                        {!d.reminder_sent_15m && !d.reminder_sent_6h && (
                          <span className="text-xs text-text-muted">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-xs text-text-muted">
                        <Clock className="w-3 h-3" />
                        {timeAgo(d.created_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
