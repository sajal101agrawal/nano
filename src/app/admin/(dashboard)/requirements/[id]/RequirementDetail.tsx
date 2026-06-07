"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  cn,
  formatDate,
  formatRelativeTime,
  requirementStatusBadgeClass,
  applicationStatusBadgeClass,
  availabilityBadgeClass,
  getInitials,
} from "@/lib/cn";
import type {
  Requirement,
  RequirementQuestion,
  Application,
  Match,
  ParsedRequirements,
} from "@/types";

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

type RequirementWithClient = Requirement & { client_name?: string };

interface Props {
  requirement: RequirementWithClient;
  questions: RequirementQuestion[];
  applications: ApplicationWithCandidate[];
  matches: MatchWithCandidate[];
  publicUrl: string;
  initialMatchQueued?: boolean;
}

type Tab = "shortlist" | "applications" | "details";
type StatusOption = Requirement["status"];

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "filled", label: "Filled" },
  { value: "closed", label: "Closed" },
];

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const color =
    pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-hover rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-text-dim w-7 text-right">{pct}</span>
    </div>
  );
}

export default function RequirementDetail({
  requirement: initialRequirement,
  questions,
  applications,
  matches,
  publicUrl,
  initialMatchQueued = false,
}: Props) {
  const router = useRouter();
  const [requirement, setRequirement] = useState(initialRequirement);
  const [activeTab, setActiveTab] = useState<Tab>("shortlist");
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rematching, setRematching] = useState(false);
  // True whenever a job is waiting/active in the queue (either from initial load or after trigger)
  const [matchQueued, setMatchQueued] = useState(initialMatchQueued);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the queue status every 4 s while a job is in-flight, stop once it completes
  useEffect(() => {
    if (!matchQueued) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const check = async () => {
      try {
        const res = await fetch(`/api/admin/requirements/${requirement.id}/match`);
        const json = await res.json() as { success: boolean; data?: { queued: boolean } };
        if (json.success && json.data) {
          setMatchQueued(json.data.queued);
          if (!json.data.queued) {
            // Job finished — refresh the page to show updated match results
            router.refresh();
          }
        }
      } catch { /* ignore */ }
    };
    pollRef.current = setInterval(check, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [matchQueued, requirement.id, router]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [publicUrl]);

  const handleStatusChange = useCallback(
    async (newStatus: StatusOption) => {
      if (newStatus === requirement.status) {
        setStatusOpen(false);
        return;
      }
      setStatusUpdating(true);
      setStatusOpen(false);
      try {
        const res = await fetch(`/api/admin/requirements/${requirement.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        const data = await res.json() as { success: boolean; data?: Requirement };
        if (data.success && data.data) {
          setRequirement((prev) => ({ ...prev, status: data.data!.status }));
        }
      } catch {
        // silently fail — page can be refreshed
      } finally {
        setStatusUpdating(false);
      }
    },
    [requirement.id, requirement.status]
  );

  const handleRematch = useCallback(async () => {
    if (matchQueued) return;
    setRematching(true);
    try {
      const res = await fetch(`/api/admin/requirements/${requirement.id}/match`, { method: "POST" });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        setMatchQueued(true);
      }
    } catch { /* ignore */ } finally {
      setRematching(false);
    }
  }, [requirement.id, matchQueued]);

  const parsed = requirement.parsed_requirements_json as ParsedRequirements | undefined;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header card ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-bg-secondary p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => setStatusOpen((v) => !v)}
                  disabled={statusUpdating}
                  className={cn(
                    requirementStatusBadgeClass(requirement.status),
                    "cursor-pointer flex items-center gap-1 transition-opacity",
                    statusUpdating && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {requirement.status.replace(/_/g, " ")}
                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {statusOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 min-w-[130px] rounded-lg border border-border bg-bg-secondary shadow-xl py-1">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleStatusChange(opt.value)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm transition-colors",
                          opt.value === requirement.status
                            ? "text-primary font-medium"
                            : "text-text-dim hover:text-text-light hover:bg-bg-hover"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {requirement.client_name && (
                <span className="text-sm text-text-dim">{requirement.client_name}</span>
              )}
              {requirement.work_mode && (
                <span className="text-xs text-text-dim capitalize">{requirement.work_mode}</span>
              )}
              {requirement.engagement_type && (
                <span className="text-xs text-text-dim capitalize">{requirement.engagement_type}</span>
              )}
            </div>

            {/* Public URL row */}
            <div className="flex items-center gap-2">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-primary hover:underline truncate"
              >
                {publicUrl}
              </a>
              <button
                onClick={handleCopy}
                className="shrink-0 p-1 rounded text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 10h6a2 2 0 002-2v-8a2 2 0 00-2-2h-6a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-text-dim">{applications.length} applications</span>
            <button
              onClick={handleRematch}
              disabled={rematching || matchQueued}
              title={matchQueued ? "Match job is already running" : undefined}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all inline-flex items-center gap-1.5",
                matchQueued
                  ? "border-amber-500/30 bg-amber-500/8 text-amber-400 cursor-not-allowed"
                  : "border-border text-text-dim hover:text-text-light hover:bg-bg-hover",
                rematching && "opacity-60 cursor-not-allowed"
              )}
            >
              {(rematching || matchQueued) ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {rematching ? "Queuing..." : "Matching..."}
                </>
              ) : (
                "Trigger Re-match"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1 w-fit">
        {(["shortlist", "applications", "details"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors",
              activeTab === tab
                ? "bg-primary text-white"
                : "text-text-dim hover:text-text-light"
            )}
          >
            {tab === "applications"
              ? `All Applications${applications.length > 0 ? ` (${applications.length})` : ""}`
              : tab === "shortlist"
              ? `Shortlist${matches.length > 0 ? ` (${matches.length})` : ""}`
              : "Details"}
          </button>
        ))}
      </div>

      {/* ── Shortlist tab ────────────────────────────────────── */}
      {activeTab === "shortlist" && (
        <div className="space-y-3">
          {matches.length === 0 ? (
            <div className="rounded-xl border border-border bg-bg-secondary p-12 text-center">
              <p className="text-text-dim text-sm">No matches yet.</p>
              <p className="text-text-dim/60 text-xs mt-1">
                Click &quot;Trigger Re-match&quot; to run AI matching against the candidate pool.
              </p>
            </div>
          ) : (
            matches.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-border bg-bg-secondary p-4 space-y-3 hover:border-border-hover transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                    {getInitials(m.candidate_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-light">{m.candidate_name}</span>
                      <span className={availabilityBadgeClass(m.candidate_availability)}>
                        {m.candidate_availability}
                      </span>
                      {m.open_to_contract && (
                        <span className="text-[10px] font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          contract ok
                        </span>
                      )}
                    </div>
                    {m.candidate_headline && (
                      <p className="text-xs text-text-dim mt-0.5 truncate">{m.candidate_headline}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/admin/candidates/${m.candidate_id}`}
                      className="px-2.5 py-1 rounded-md border border-border text-xs text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors"
                    >
                      View profile
                    </a>
                    <a
                      href={`mailto:${m.candidate_email}?subject=Opportunity: ${encodeURIComponent(requirement.title)}`}
                      className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-xs text-primary hover:bg-primary/20 transition-colors"
                    >
                      Send email
                    </a>
                  </div>
                </div>

                {/* Score bar */}
                {m.score !== undefined && m.score !== null && (
                  <ScoreBar score={m.score * (m.score <= 1 ? 100 : 1)} />
                )}

                {/* Skills */}
                {m.skills && m.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.skills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-medium bg-bg-hover border border-border text-text-dim px-2 py-0.5 rounded-md"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Rationale */}
                {m.rationale && (
                  <p className="text-xs text-text-dim leading-relaxed border-t border-border pt-2.5">
                    {m.rationale}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── All Applications tab ─────────────────────────────── */}
      {activeTab === "applications" && (
        <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
          {applications.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-text-dim text-sm">No applications yet.</p>
              <p className="text-text-dim/60 text-xs mt-1">
                Share the public URL to start receiving applications.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-dim">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-dim hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-dim hidden md:table-cell">Availability</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-dim hidden lg:table-cell">Score</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-dim hidden sm:table-cell">Applied</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-dim">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold shrink-0">
                          {getInitials(app.candidate_name)}
                        </div>
                        <div className="min-w-0">
                          <a
                            href={`/admin/candidates/${app.candidate_id}`}
                            className="text-sm font-medium text-text-light hover:text-primary transition-colors"
                          >
                            {app.candidate_name}
                          </a>
                          {app.candidate_headline && (
                            <p className="text-xs text-text-dim truncate max-w-[180px]">{app.candidate_headline}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className={applicationStatusBadgeClass(app.status)}>
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className={availabilityBadgeClass(app.candidate_availability)}>
                        {app.candidate_availability}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {app.match_score !== undefined && app.match_score !== null ? (
                        <div className="w-24">
                          <ScoreBar score={app.match_score <= 1 ? app.match_score * 100 : app.match_score} />
                        </div>
                      ) : (
                        <span className="text-xs text-text-dim/40">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right hidden sm:table-cell">
                      <span className="text-xs text-text-dim" title={formatDate(app.applied_at)}>
                        {formatRelativeTime(app.applied_at)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`/admin/candidates/${app.candidate_id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Details tab ──────────────────────────────────────── */}
      {activeTab === "details" && (
        <div className="space-y-4">
          {/* Parsed requirements */}
          {parsed && (
            <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
              <h3 className="font-display font-semibold text-text-light text-sm">Parsed Requirements</h3>

              {parsed.required_skills && parsed.required_skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-dim mb-2">Required Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.required_skills.map((s) => (
                      <span key={s} className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-md">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parsed.nice_to_have_skills && parsed.nice_to_have_skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-dim mb-2">Nice to Have</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.nice_to_have_skills.map((s) => (
                      <span key={s} className="text-xs bg-bg-hover border border-border text-text-dim px-2 py-0.5 rounded-md">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
                {parsed.min_experience_years !== undefined && (
                  <div>
                    <p className="text-xs text-text-dim">Min Experience</p>
                    <p className="text-sm text-text-light font-medium">{parsed.min_experience_years} yrs</p>
                  </div>
                )}
                {parsed.max_experience_years !== undefined && (
                  <div>
                    <p className="text-xs text-text-dim">Max Experience</p>
                    <p className="text-sm text-text-light font-medium">{parsed.max_experience_years} yrs</p>
                  </div>
                )}
                {parsed.location && (
                  <div>
                    <p className="text-xs text-text-dim">Location</p>
                    <p className="text-sm text-text-light font-medium">{parsed.location}</p>
                  </div>
                )}
                {parsed.work_mode && (
                  <div>
                    <p className="text-xs text-text-dim">Work Mode</p>
                    <p className="text-sm text-text-light font-medium capitalize">{parsed.work_mode}</p>
                  </div>
                )}
                {parsed.budget_range && (
                  <div>
                    <p className="text-xs text-text-dim">Budget Range</p>
                    <p className="text-sm text-text-light font-medium">{parsed.budget_range}</p>
                  </div>
                )}
              </div>

              {parsed.key_responsibilities && parsed.key_responsibilities.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-dim mb-2">Key Responsibilities</p>
                  <ul className="space-y-1">
                    {parsed.key_responsibilities.map((r, i) => (
                      <li key={i} className="text-sm text-text-dim flex gap-2">
                        <span className="text-text-dim/40 shrink-0">·</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Budget info */}
          {(requirement.budget_min || requirement.budget_max) && (
            <div className="rounded-xl border border-border bg-bg-secondary p-5">
              <h3 className="font-display font-semibold text-text-light text-sm mb-3">Budget</h3>
              <div className="flex items-center gap-2 text-sm text-text-light">
                <span className="text-text-dim">{requirement.budget_currency}</span>
                {requirement.budget_min && <span>{requirement.budget_min.toLocaleString()}</span>}
                {requirement.budget_min && requirement.budget_max && <span className="text-text-dim">–</span>}
                {requirement.budget_max && <span>{requirement.budget_max.toLocaleString()}</span>}
                {requirement.budget_period && (
                  <span className="text-text-dim capitalize">/ {requirement.budget_period}</span>
                )}
              </div>
            </div>
          )}

          {/* Screening questions */}
          {questions.length > 0 && (
            <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-3">
              <h3 className="font-display font-semibold text-text-light text-sm">Screening Questions</h3>
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div key={q.id} className="flex items-start gap-3 bg-bg rounded-lg border border-border p-3">
                    <span className="text-xs text-text-dim w-5 shrink-0 text-right mt-0.5">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-light">{q.question_text}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-text-dim capitalize">{q.question_type}</span>
                        <span className={cn("text-[10px] font-medium", q.required ? "text-amber-500" : "text-text-dim/50")}>
                          {q.required ? "Required" : "Optional"}
                        </span>
                        {q.options && q.options.length > 0 && (
                          <span className="text-[10px] text-text-dim/60">
                            {q.options.map((o) => o.label).join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full JD */}
          <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-3">
            <h3 className="font-display font-semibold text-text-light text-sm">Full Job Description</h3>
            <pre className="text-sm text-text-dim leading-relaxed whitespace-pre-wrap font-sans">
              {requirement.jd_raw}
            </pre>
          </div>

          {/* Metadata */}
          <div className="rounded-xl border border-border bg-bg-secondary p-5">
            <h3 className="font-display font-semibold text-text-light text-sm mb-3">Metadata</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <dt className="text-xs text-text-dim">Created</dt>
                <dd className="text-sm text-text-light mt-0.5">{formatDate(requirement.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-dim">Updated</dt>
                <dd className="text-sm text-text-light mt-0.5">{formatDate(requirement.updated_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-dim">Slug</dt>
                <dd className="text-sm text-text-light mt-0.5 font-mono">{requirement.public_slug}</dd>
              </div>
              {requirement.location && (
                <div>
                  <dt className="text-xs text-text-dim">Location</dt>
                  <dd className="text-sm text-text-light mt-0.5">{requirement.location}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
