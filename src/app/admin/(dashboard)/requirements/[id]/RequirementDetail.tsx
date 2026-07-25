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
import SendEmailModal from "@/app/admin/(dashboard)/candidates/[id]/SendEmailModal";
import ApplicationStatusDropdown from "@/components/admin/ApplicationStatusDropdown";
import StarRating from "@/components/admin/StarRating";
import NoteForm from "@/components/admin/NoteForm";
import ScheduleInterviewModal from "@/components/admin/ScheduleInterviewModal";
import ReminderModal from "@/components/admin/ReminderModal";
import KanbanBoard from "@/components/admin/KanbanBoard";
import FunnelAnalytics from "@/components/admin/FunnelAnalytics";
import type {
  Requirement,
  RequirementQuestion,
  Application,
  Match,
  ParsedRequirements,
  PipelineStage,
  CandidateNote,
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
  is_manual?: boolean;
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

type Tab = "pipeline" | "applications" | "shortlist" | "analytics" | "details";
type StatusOption = Requirement["status"];

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On Hold" },
  { value: "filled", label: "Filled" },
  { value: "closed", label: "Closed" },
];

const APP_STATUS_OPTIONS = [
  "all", "applied", "shortlisted", "contacted", "in_discussion", "offered", "placed", "rejected", "withdrawn",
] as const;

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
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
  applications: initialApplications,
  matches,
  publicUrl,
  initialMatchQueued = false,
}: Props) {
  const router = useRouter();
  const [requirement, setRequirement] = useState(initialRequirement);
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [matchQueued, setMatchQueued] = useState(initialMatchQueued);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Applications state
  const [applications, setApplications] = useState<ApplicationWithCandidate[]>(initialApplications);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSeen, setFilterSeen] = useState<"all" | "seen" | "unseen">("all");
  const [filterAvailability, setFilterAvailability] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "score" | "name">("date");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Email modal
  const [emailTarget, setEmailTarget] = useState<{ candidateId: string; candidateName: string; candidateEmail: string } | null>(null);

  // Interview modal
  const [interviewTarget, setInterviewTarget] = useState<{ applicationId: string; candidateName: string } | null>(null);

  // Reminder modal
  const [reminderTarget, setReminderTarget] = useState<{ candidateId: string; candidateName: string; applicationId: string } | null>(null);

  // Shortlist state
  const [shortlistItems, setShortlistItems] = useState<MatchWithCandidate[]>(matches);
  const [shortlistLoading, setShortlistLoading] = useState<Record<string, boolean>>({});
  const [shortlistError, setShortlistError] = useState<string>("");

  // Pipeline stages
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stagesLoaded, setStagesLoaded] = useState(false);

  // Inline notes
  const [openNoteFor, setOpenNoteFor] = useState<string | null>(null);

  // Keep previous matches reference
  const [prevMatches, setPrevMatches] = useState(matches);
  if (matches !== prevMatches) {
    setPrevMatches(matches);
    setShortlistItems(matches);
  }
  const [prevApplications, setPrevApplications] = useState(initialApplications);
  if (initialApplications !== prevApplications) {
    setPrevApplications(initialApplications);
    setApplications(initialApplications);
  }

  const shortlistedIds = new Set(shortlistItems.map((m) => m.candidate_id));

  // Load pipeline stages
  useEffect(() => {
    fetch(`/api/admin/requirements/${requirement.id}/stages`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: PipelineStage[] }) => {
        if (j.success && j.data) setStages(j.data);
        setStagesLoaded(true);
      })
      .catch(() => setStagesLoaded(true));
  }, [requirement.id]);

  // Poll for match job completion
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
          if (!json.data.queued) router.refresh();
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

  const handleStatusChange = useCallback(async (newStatus: StatusOption) => {
    if (newStatus === requirement.status) { setStatusOpen(false); return; }
    setStatusUpdating(true);
    setStatusOpen(false);
    try {
      const res = await fetch(`/api/admin/requirements/${requirement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json() as { success: boolean; data?: Requirement };
      if (data.success && data.data) setRequirement((prev) => ({ ...prev, status: data.data!.status }));
    } catch { /* ignore */ } finally {
      setStatusUpdating(false);
    }
  }, [requirement.id, requirement.status]);

  const handleRematch = useCallback(async () => {
    if (matchQueued) return;
    setRematching(true);
    try {
      const res = await fetch(`/api/admin/requirements/${requirement.id}/match`, { method: "POST" });
      const json = await res.json() as { success: boolean };
      if (json.success) setMatchQueued(true);
    } catch { /* ignore */ } finally {
      setRematching(false);
    }
  }, [requirement.id, matchQueued]);

  // Update single application status inline
  const updateAppStatus = useCallback(async (appId: string, newStatus: string) => {
    setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: newStatus as Application["status"] } : a));
    try {
      await fetch(`/api/admin/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch { /* revert not needed, page can be refreshed */ }
  }, []);

  // Update single application rating inline
  const updateAppRating = useCallback(async (appId: string, rating: number | null) => {
    setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, rating: rating ?? undefined } : a));
    try {
      await fetch(`/api/admin/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
    } catch { /* ignore */ }
  }, []);

  // Mark seen/unseen
  const markSeen = useCallback(async (appId: string, seen: boolean) => {
    setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, seen_at: seen ? new Date().toISOString() : undefined } : a));
    try {
      await fetch(`/api/admin/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seen }),
      });
    } catch { /* ignore */ }
  }, []);

  // Move card in kanban
  const handleKanbanStageChange = useCallback(async (appId: string, stageId: string) => {
    setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, pipeline_stage_id: stageId } : a));
    const stage = stages.find((s) => s.id === stageId);
    try {
      await fetch(`/api/admin/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage_id: stageId, ...(stage?.maps_to_status ? { status: stage.maps_to_status } : {}) }),
      });
    } catch { /* ignore */ }
  }, [stages]);

  // Bulk status change
  const handleBulkStatusChange = useCallback(async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await fetch("/api/admin/applications/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: newStatus }),
      });
      setApplications((prev) => prev.map((a) => selectedIds.has(a.id) ? { ...a, status: newStatus as Application["status"] } : a));
      setSelectedIds(new Set());
    } catch { /* ignore */ } finally {
      setBulkLoading(false);
    }
  }, [selectedIds]);

  // Bulk export CSV
  const handleExportCSV = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const url = ids.length > 0
      ? `/api/admin/applications/bulk?requirement_id=${requirement.id}&ids=${ids.join(",")}`
      : `/api/admin/applications/bulk?requirement_id=${requirement.id}`;
    window.open(url, "_blank");
  }, [selectedIds, requirement.id]);

  // Shortlist handlers
  const handleAddToShortlist = useCallback(async (app: ApplicationWithCandidate) => {
    setShortlistLoading((p) => ({ ...p, [app.candidate_id]: true }));
    setShortlistError("");
    try {
      const res = await fetch("/api/admin/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: requirement.id, candidateId: app.candidate_id }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || "Failed");
      setShortlistItems((prev) => [
        ...prev,
        {
          id: `manual-${app.candidate_id}`,
          requirement_id: requirement.id,
          candidate_id: app.candidate_id,
          candidate_name: app.candidate_name,
          candidate_email: app.candidate_email,
          candidate_headline: app.candidate_headline,
          candidate_availability: app.candidate_availability,
          open_to_contract: false,
          skills: [],
          score: undefined,
          vector_score: undefined,
          rule_score: undefined,
          rationale: "Manually shortlisted",
          generated_at: new Date().toISOString(),
          is_manual: true,
        } as MatchWithCandidate,
      ]);
    } catch (err) {
      setShortlistError(err instanceof Error ? err.message : "Failed");
    } finally {
      setShortlistLoading((p) => ({ ...p, [app.candidate_id]: false }));
    }
  }, [requirement.id]);

  const handleRemoveFromShortlist = useCallback(async (candidateId: string) => {
    setShortlistLoading((p) => ({ ...p, [candidateId]: true }));
    try {
      const res = await fetch("/api/admin/shortlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: requirement.id, candidateId }),
      });
      const json = await res.json() as { success: boolean };
      if (!json.success) throw new Error("Failed");
      setShortlistItems((prev) => prev.filter((m) => m.candidate_id !== candidateId));
    } catch { /* ignore */ } finally {
      setShortlistLoading((p) => ({ ...p, [candidateId]: false }));
    }
  }, [requirement.id]);

  const parsed = requirement.parsed_requirements_json as ParsedRequirements | undefined;

  // Filtered + sorted applications
  const filteredApps = applications.filter((app) => {
    if (filterStatus !== "all" && app.status !== filterStatus) return false;
    if (filterSeen === "seen" && !app.seen_at) return false;
    if (filterSeen === "unseen" && app.seen_at) return false;
    if (filterAvailability !== "all" && app.candidate_availability !== filterAvailability) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "score") {
      return (b.match_score ?? -1) - (a.match_score ?? -1);
    }
    if (sortBy === "name") {
      return (a.candidate_name || "").localeCompare(b.candidate_name || "");
    }
    return new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime();
  });

  // Stats
  const stats = {
    total: applications.length,
    shortlisted: applications.filter((a) => ["shortlisted"].includes(a.status)).length,
    contacted: applications.filter((a) => a.status === "contacted").length,
    inDiscussion: applications.filter((a) => a.status === "in_discussion").length,
    offered: applications.filter((a) => a.status === "offered").length,
    placed: applications.filter((a) => a.status === "placed").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
    unseen: applications.filter((a) => !a.seen_at).length,
  };

  return (
    <>
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-bg-secondary p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <button
                  onClick={() => setStatusOpen((v) => !v)}
                  disabled={statusUpdating}
                  className={cn(requirementStatusBadgeClass(requirement.status), "cursor-pointer flex items-center gap-1 transition-opacity", statusUpdating && "opacity-60 cursor-not-allowed")}
                >
                  {requirement.status.replace(/_/g, " ")}
                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {statusOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 min-w-[130px] rounded-lg border border-border bg-bg-secondary shadow-xl py-1">
                    {STATUS_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                        className={cn("w-full text-left px-3 py-2 text-sm transition-colors", opt.value === requirement.status ? "text-primary font-medium" : "text-text-dim hover:text-text-light hover:bg-bg-hover")}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {requirement.client_name && <span className="text-sm text-text-dim">{requirement.client_name}</span>}
              {requirement.work_mode && <span className="text-xs text-text-dim capitalize">{requirement.work_mode}</span>}
              {requirement.engagement_type && <span className="text-xs text-text-dim capitalize">{requirement.engagement_type}</span>}
            </div>
            <div className="flex items-center gap-2">
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary hover:underline truncate">{publicUrl}</a>
              <button onClick={handleCopy} className="shrink-0 p-1 rounded text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">
                {copied
                  ? <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 10h6a2 2 0 002-2v-8a2 2 0 00-2-2h-6a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                }
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-text-dim">{applications.length} applications</span>
            <a href={`/admin/requirements/${requirement.id}/edit`} className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-text-dim hover:text-text-light hover:bg-bg-hover transition-all inline-flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit
            </a>
            <button onClick={handleRematch} disabled={rematching || matchQueued}
              className={cn("px-3 py-1.5 rounded-lg border text-sm font-medium transition-all inline-flex items-center gap-1.5", matchQueued ? "border-amber-500/30 bg-amber-500/8 text-amber-400 cursor-not-allowed" : "border-border text-text-dim hover:text-text-light hover:bg-bg-hover", rematching && "opacity-60 cursor-not-allowed")}>
              {(rematching || matchQueued)
                ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{rematching ? "Queuing..." : "Matching..."}</>
                : "Trigger Re-match"
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {[
          { label: "Total", value: stats.total, color: "text-text-light" },
          { label: "Unseen", value: stats.unseen, color: "text-primary" },
          { label: "Shortlisted", value: stats.shortlisted, color: "text-purple-400" },
          { label: "Contacted", value: stats.contacted, color: "text-violet-400" },
          { label: "In Discussion", value: stats.inDiscussion, color: "text-amber-400" },
          { label: "Offered", value: stats.offered, color: "text-orange-400" },
          { label: "Placed", value: stats.placed, color: "text-emerald-400" },
          { label: "Rejected", value: stats.rejected, color: "text-gray-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-bg-secondary p-2.5 text-center">
            <p className={cn("text-lg font-bold font-display tabular-nums", s.color)}>{s.value}</p>
            <p className="text-[10px] text-text-dim mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1 w-fit">
        {(["pipeline", "applications", "shortlist", "analytics", "details"] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors",
              activeTab === tab ? "bg-primary text-white" : "text-text-dim hover:text-text-light")}>
            {tab === "applications" ? `All Applications${applications.length > 0 ? ` (${applications.length})` : ""}`
              : tab === "shortlist" ? `Shortlist${shortlistItems.length > 0 ? ` (${shortlistItems.length})` : ""}`
              : tab === "pipeline" ? "Pipeline"
              : tab === "analytics" ? "Analytics"
              : "Details"}
          </button>
        ))}
      </div>

      {/* ── Pipeline (Kanban) tab ────────────────────────────── */}
      {activeTab === "pipeline" && (
        <div>
          {!stagesLoaded ? (
            <div className="p-8 text-center text-text-dim text-sm">Loading pipeline...</div>
          ) : stages.length === 0 ? (
            <div className="rounded-xl border border-border bg-bg-secondary p-12 text-center">
              <p className="text-text-dim text-sm">No pipeline stages configured.</p>
            </div>
          ) : (
            <KanbanBoard
              stages={stages}
              cards={applications.map((app) => ({
                id: app.id,
                application_id: app.id,
                candidate_id: app.candidate_id,
                candidate_name: app.candidate_name,
                candidate_email: app.candidate_email,
                candidate_headline: app.candidate_headline,
                candidate_availability: app.candidate_availability,
                status: app.status,
                pipeline_stage_id: app.pipeline_stage_id ?? null,
                match_score: app.match_score ?? null,
                rating: app.rating ?? null,
                seen_at: app.seen_at ?? null,
                applied_at: app.applied_at,
              }))}
              onStageChange={handleKanbanStageChange}
              onCardClick={(card) => {
                markSeen(card.application_id, true);
                window.open(`/admin/candidates/${card.candidate_id}`, "_blank");
              }}
            />
          )}
        </div>
      )}

      {/* ── All Applications tab ─────────────────────────────── */}
      {activeTab === "applications" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 bg-bg-secondary border border-border rounded-xl px-4 py-3">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-border bg-bg rounded-md px-2 py-1.5 text-text-dim focus:outline-none focus:border-primary/50">
              {APP_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace(/_/g, " ")}</option>
              ))}
            </select>

            <select value={filterSeen} onChange={(e) => setFilterSeen(e.target.value as "all" | "seen" | "unseen")}
              className="text-xs border border-border bg-bg rounded-md px-2 py-1.5 text-text-dim focus:outline-none focus:border-primary/50">
              <option value="all">All (seen/unseen)</option>
              <option value="unseen">Unseen only</option>
              <option value="seen">Seen only</option>
            </select>

            <select value={filterAvailability} onChange={(e) => setFilterAvailability(e.target.value)}
              className="text-xs border border-border bg-bg rounded-md px-2 py-1.5 text-text-dim focus:outline-none focus:border-primary/50">
              <option value="all">All Availability</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              <option value="unknown">Unknown</option>
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "score" | "name")}
              className="text-xs border border-border bg-bg rounded-md px-2 py-1.5 text-text-dim focus:outline-none focus:border-primary/50">
              <option value="date">Sort: Date</option>
              <option value="score">Sort: Score</option>
              <option value="name">Sort: Name</option>
            </select>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-text-dim">{filteredApps.length} of {applications.length}</span>
              <button onClick={handleExportCSV}
                className="px-2.5 py-1.5 rounded-md border border-border text-xs text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/8 border border-primary/25 rounded-xl px-4 py-2.5">
              <span className="text-xs text-primary font-medium">{selectedIds.size} selected</span>
              <div className="flex items-center gap-2 ml-2 flex-wrap">
                {["shortlisted","contacted","in_discussion","offered","placed","rejected"].map((s) => (
                  <button key={s} onClick={() => handleBulkStatusChange(s)} disabled={bulkLoading}
                    className="px-2.5 py-1 rounded-md border border-border text-xs text-text-dim hover:text-text-light hover:bg-bg-hover disabled:opacity-50 transition-colors capitalize">
                    → {s.replace(/_/g, " ")}
                  </button>
                ))}
                <button onClick={handleExportCSV}
                  className="px-2.5 py-1 rounded-md border border-border text-xs text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">
                  Export
                </button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="px-2.5 py-1 rounded-md text-xs text-text-dim hover:text-text-light transition-colors">
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Applications table */}
          <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
            {filteredApps.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-text-dim text-sm">No applications match your filters.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-8 px-3 py-3">
                      <input type="checkbox"
                        checked={selectedIds.size === filteredApps.length && filteredApps.length > 0}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredApps.map((a) => a.id)) : new Set())}
                        className="rounded border-border text-primary focus:ring-primary/50 bg-bg cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-text-dim">Candidate</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-text-dim hidden sm:table-cell">Status</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-text-dim hidden md:table-cell">Availability</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-text-dim hidden lg:table-cell">Score</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-text-dim hidden lg:table-cell">Rating</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-text-dim hidden sm:table-cell">Applied</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-text-dim">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredApps.map((app) => {
                    const inShortlist = shortlistedIds.has(app.candidate_id);
                    const isSelected = selectedIds.has(app.id);
                    const scoreDisplay = app.match_score != null ? (app.match_score <= 1 ? app.match_score * 100 : app.match_score) : null;
                    return (
                      <>
                      <tr key={app.id} className={cn("transition-colors", isSelected ? "bg-primary/5" : "hover:bg-bg-hover", !app.seen_at && "border-l-2 border-l-primary/40")}>
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={isSelected}
                            onChange={(e) => { const s = new Set(selectedIds); e.target.checked ? s.add(app.id) : s.delete(app.id); setSelectedIds(s); }}
                            className="rounded border-border text-primary focus:ring-primary/50 bg-bg cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold shrink-0">
                              {getInitials(app.candidate_name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <a href={`/admin/candidates/${app.candidate_id}`} onClick={() => markSeen(app.id, true)}
                                  className="text-sm font-medium text-text-light hover:text-primary transition-colors">
                                  {app.candidate_name}
                                </a>
                                {!app.seen_at && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="New / unseen" />
                                )}
                              </div>
                              {app.candidate_headline && <p className="text-xs text-text-dim truncate max-w-[180px]">{app.candidate_headline}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <ApplicationStatusDropdown
                            status={app.status}
                            onChangeStatus={(s) => updateAppStatus(app.id, s)}
                            compact
                          />
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className={availabilityBadgeClass(app.candidate_availability)}>{app.candidate_availability}</span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          {scoreDisplay !== null ? <div className="w-20"><ScoreBar score={scoreDisplay} /></div> : <span className="text-xs text-text-dim/40">—</span>}
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <StarRating
                            value={app.rating ?? null}
                            onChange={(r) => updateAppRating(app.id, r)}
                          />
                        </td>
                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          <span className="text-xs text-text-dim" title={formatDate(app.applied_at)}>{formatRelativeTime(app.applied_at)}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Shortlist toggle */}
                            <button onClick={() => inShortlist ? handleRemoveFromShortlist(app.candidate_id) : handleAddToShortlist(app)}
                              disabled={shortlistLoading[app.candidate_id]}
                              title={inShortlist ? "Remove from shortlist" : "Add to shortlist"}
                              className={cn("px-2 py-1 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-40",
                                inShortlist ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-red-400/10 hover:border-red-400/30 hover:text-red-400"
                                  : "border-border text-text-dim hover:text-primary hover:border-primary/30 hover:bg-primary/8")}>
                              {inShortlist ? "✓" : "+"}
                            </button>
                            {/* Email */}
                            <button onClick={() => setEmailTarget({ candidateId: app.candidate_id, candidateName: app.candidate_name, candidateEmail: app.candidate_email })}
                              title="Send email"
                              className="px-2 py-1 rounded-md border border-border text-[11px] text-text-dim hover:text-primary hover:border-primary/30 hover:bg-primary/8 transition-colors">
                              ✉
                            </button>
                            {/* Interview */}
                            <button onClick={() => setInterviewTarget({ applicationId: app.id, candidateName: app.candidate_name })}
                              title="Schedule interview"
                              className="px-2 py-1 rounded-md border border-border text-[11px] text-text-dim hover:text-violet-400 hover:border-violet-400/30 hover:bg-violet-400/8 transition-colors">
                              📅
                            </button>
                            {/* Note toggle */}
                            <button onClick={() => setOpenNoteFor(openNoteFor === app.id ? null : app.id)}
                              title="Add note"
                              className={cn("px-2 py-1 rounded-md border text-[11px] transition-colors",
                                openNoteFor === app.id ? "border-amber-400/30 bg-amber-400/10 text-amber-400" : "border-border text-text-dim hover:text-amber-400 hover:border-amber-400/30 hover:bg-amber-400/8")}>
                              ✏
                            </button>
                            {/* Seen/unseen toggle */}
                            <button onClick={() => markSeen(app.id, !app.seen_at)}
                              title={app.seen_at ? "Mark as unseen" : "Mark as seen"}
                              className="px-2 py-1 rounded-md border border-border text-[11px] text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">
                              {app.seen_at ? "👁" : "👁‍🗨"}
                            </button>
                            {/* Reminder */}
                            <button onClick={() => setReminderTarget({ candidateId: app.candidate_id, candidateName: app.candidate_name, applicationId: app.id })}
                              title="Set reminder"
                              className="px-2 py-1 rounded-md border border-border text-[11px] text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">
                              🔔
                            </button>
                            <a href={`/admin/candidates/${app.candidate_id}`} className="text-xs text-primary hover:underline ml-1">View</a>
                          </div>
                        </td>
                      </tr>
                      {/* Inline note form */}
                      {openNoteFor === app.id && (
                        <tr key={`${app.id}-note`}>
                          <td colSpan={8} className="px-6 pb-3 pt-1 bg-amber-400/4">
                            <NoteForm
                              candidateId={app.candidate_id}
                              applicationId={app.id}
                              requirementId={requirement.id}
                              onAdded={() => setOpenNoteFor(null)}
                              compact
                            />
                          </td>
                        </tr>
                      )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Shortlist tab ────────────────────────────────────── */}
      {activeTab === "shortlist" && (
        <div className="space-y-3">
          {shortlistError && <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/20 rounded-lg px-3 py-2">{shortlistError}</p>}
          {shortlistItems.length === 0 ? (
            <div className="rounded-xl border border-border bg-bg-secondary p-12 text-center">
              <p className="text-text-dim text-sm">No matches yet.</p>
              <p className="text-text-dim/60 text-xs mt-1">Click "Trigger Re-match" to run AI matching, or manually add candidates from the Applications tab.</p>
            </div>
          ) : (
            shortlistItems.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-bg-secondary p-4 space-y-3 hover:border-border-hover transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                    {getInitials(m.candidate_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-light">{m.candidate_name}</span>
                      <span className={availabilityBadgeClass(m.candidate_availability)}>{m.candidate_availability}</span>
                      {m.open_to_contract && <span className="text-[10px] font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded">contract ok</span>}
                      {m.is_manual && <span className="text-[10px] font-medium text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">manual</span>}
                    </div>
                    {m.candidate_headline && <p className="text-xs text-text-dim mt-0.5 truncate">{m.candidate_headline}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={`/admin/candidates/${m.candidate_id}`} className="px-2.5 py-1 rounded-md border border-border text-xs text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">View</a>
                    <button onClick={() => setEmailTarget({ candidateId: m.candidate_id, candidateName: m.candidate_name, candidateEmail: m.candidate_email })}
                      className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-xs text-primary hover:bg-primary/20 transition-colors">
                      Send email
                    </button>
                    <button onClick={() => handleRemoveFromShortlist(m.candidate_id)} disabled={shortlistLoading[m.candidate_id]}
                      className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-400/8 transition-colors disabled:opacity-40">
                      {shortlistLoading[m.candidate_id]
                        ? <div className="w-3.5 h-3.5 border border-text-dim/30 border-t-text-dim rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      }
                    </button>
                  </div>
                </div>
                {m.score !== undefined && m.score !== null && <ScoreBar score={m.score * (m.score <= 1 ? 100 : 1)} />}
                {m.skills && m.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.skills.map((s) => <span key={s} className="text-[10px] font-medium bg-bg-hover border border-border text-text-dim px-2 py-0.5 rounded-md">{s}</span>)}
                  </div>
                )}
                {m.rationale && <p className="text-xs text-text-dim leading-relaxed border-t border-border pt-2.5">{m.rationale}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Analytics tab ────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <FunnelAnalytics requirementId={requirement.id} />
      )}

      {/* ── Details tab ──────────────────────────────────────── */}
      {activeTab === "details" && (
        <div className="space-y-4">
          {parsed && (
            <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
              <h3 className="font-display font-semibold text-text-light text-sm">Parsed Requirements</h3>
              {parsed.required_skills && parsed.required_skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-dim mb-2">Required Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.required_skills.map((s) => <span key={s} className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-md">{s}</span>)}
                  </div>
                </div>
              )}
              {parsed.nice_to_have_skills && parsed.nice_to_have_skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-dim mb-2">Nice to Have</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.nice_to_have_skills.map((s) => <span key={s} className="text-xs bg-bg-hover border border-border text-text-dim px-2 py-0.5 rounded-md">{s}</span>)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
                {parsed.min_experience_years !== undefined && <div><p className="text-xs text-text-dim">Min Experience</p><p className="text-sm text-text-light font-medium">{parsed.min_experience_years} yrs</p></div>}
                {parsed.max_experience_years !== undefined && <div><p className="text-xs text-text-dim">Max Experience</p><p className="text-sm text-text-light font-medium">{parsed.max_experience_years} yrs</p></div>}
                {parsed.location && <div><p className="text-xs text-text-dim">Location</p><p className="text-sm text-text-light font-medium">{parsed.location}</p></div>}
                {parsed.work_mode && <div><p className="text-xs text-text-dim">Work Mode</p><p className="text-sm text-text-light font-medium capitalize">{parsed.work_mode}</p></div>}
                {parsed.budget_range && <div><p className="text-xs text-text-dim">Budget Range</p><p className="text-sm text-text-light font-medium">{parsed.budget_range}</p></div>}
              </div>
              {parsed.key_responsibilities && parsed.key_responsibilities.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-dim mb-2">Key Responsibilities</p>
                  <ul className="space-y-1">
                    {parsed.key_responsibilities.map((r, i) => <li key={i} className="text-sm text-text-dim flex gap-2"><span className="text-text-dim/40 shrink-0">·</span><span>{r}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {(requirement.budget_min || requirement.budget_max) && (
            <div className="rounded-xl border border-border bg-bg-secondary p-5">
              <h3 className="font-display font-semibold text-text-light text-sm mb-3">Budget</h3>
              <div className="flex items-center gap-2 text-sm text-text-light">
                <span className="text-text-dim">{requirement.budget_currency}</span>
                {requirement.budget_min && <span>{requirement.budget_min.toLocaleString()}</span>}
                {requirement.budget_min && requirement.budget_max && <span className="text-text-dim">–</span>}
                {requirement.budget_max && <span>{requirement.budget_max.toLocaleString()}</span>}
                {requirement.budget_period && <span className="text-text-dim capitalize">/ {requirement.budget_period}</span>}
              </div>
            </div>
          )}
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
                        <span className={cn("text-[10px] font-medium", q.required ? "text-amber-500" : "text-text-dim/50")}>{q.required ? "Required" : "Optional"}</span>
                        {q.options && q.options.length > 0 && <span className="text-[10px] text-text-dim/60">{q.options.map((o) => o.label).join(" · ")}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-3">
            <h3 className="font-display font-semibold text-text-light text-sm">Full Job Description</h3>
            <pre className="text-sm text-text-dim leading-relaxed whitespace-pre-wrap font-sans">{requirement.jd_raw}</pre>
          </div>
          <div className="rounded-xl border border-border bg-bg-secondary p-5">
            <h3 className="font-display font-semibold text-text-light text-sm mb-3">Metadata</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><dt className="text-xs text-text-dim">Created</dt><dd className="text-sm text-text-light mt-0.5">{formatDate(requirement.created_at)}</dd></div>
              <div><dt className="text-xs text-text-dim">Updated</dt><dd className="text-sm text-text-light mt-0.5">{formatDate(requirement.updated_at)}</dd></div>
              <div><dt className="text-xs text-text-dim">Slug</dt><dd className="text-sm text-text-light mt-0.5 font-mono">{requirement.public_slug}</dd></div>
              {requirement.location && <div><dt className="text-xs text-text-dim">Location</dt><dd className="text-sm text-text-light mt-0.5">{requirement.location}</dd></div>}
            </dl>
          </div>
        </div>
      )}
    </div>

    {/* Modals */}
    {emailTarget && (
      <SendEmailModal
        candidateId={emailTarget.candidateId}
        candidateName={emailTarget.candidateName}
        candidateEmail={emailTarget.candidateEmail}
        requirementId={requirement.id}
        defaultSubject={`Opportunity: ${requirement.title}`}
        onClose={() => setEmailTarget(null)}
      />
    )}
    {interviewTarget && (
      <ScheduleInterviewModal
        applicationId={interviewTarget.applicationId}
        candidateName={interviewTarget.candidateName}
        onClose={() => setInterviewTarget(null)}
        onScheduled={() => router.refresh()}
      />
    )}
    {reminderTarget && (
      <ReminderModal
        candidateId={reminderTarget.candidateId}
        candidateName={reminderTarget.candidateName}
        applicationId={reminderTarget.applicationId}
        requirementId={requirement.id}
        onClose={() => setReminderTarget(null)}
      />
    )}
    </>
  );
}
