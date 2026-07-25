"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  initialQ?: string;
  initialAvailability?: string;
  initialContract?: boolean;
  initialMinExp?: string;
  initialMaxExp?: string;
  initialSkills?: string;
  initialSource?: string;
  initialWorkMode?: string;
}

const SOURCES = ["", "direct", "referral", "portal", "csv_import", "api", "other"];
const WORK_MODES = ["", "remote", "hybrid", "onsite"];

export default function CandidateFilters({
  initialQ,
  initialAvailability,
  initialContract,
  initialMinExp,
  initialMaxExp,
  initialSkills,
  initialSource,
  initialWorkMode,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ || "");
  const [availability, setAvailability] = useState(initialAvailability || "");
  const [contract, setContract] = useState(initialContract || false);
  const [minExp, setMinExp] = useState(initialMinExp || "");
  const [maxExp, setMaxExp] = useState(initialMaxExp || "");
  const [skills, setSkills] = useState(initialSkills || "");
  const [source, setSource] = useState(initialSource || "");
  const [workMode, setWorkMode] = useState(initialWorkMode || "");
  const [expanded, setExpanded] = useState(!!(initialMaxExp || initialSkills || initialSource || initialWorkMode));
  const [isPending, startTransition] = useTransition();

  function apply() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (availability) params.set("availability", availability);
    if (contract) params.set("contract", "true");
    if (minExp) params.set("min_experience", minExp);
    if (maxExp) params.set("max_experience", maxExp);
    if (skills) params.set("skills", skills);
    if (source) params.set("source", source);
    if (workMode) params.set("work_mode", workMode);
    startTransition(() => {
      router.push(`/admin/candidates${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  function clear() {
    setQ(""); setAvailability(""); setContract(false);
    setMinExp(""); setMaxExp(""); setSkills(""); setSource(""); setWorkMode("");
    startTransition(() => router.push("/admin/candidates"));
  }

  const hasFilters = q || availability || contract || minExp || maxExp || skills || source || workMode;

  return (
    <div className="bg-bg-secondary border border-border rounded-xl px-4 py-3 space-y-3">
      {/* Primary row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="Search name, email, skills…"
            className="input-base pl-9 pr-4"
          />
        </div>

        <select value={availability} onChange={(e) => setAvailability(e.target.value)} className="input-base w-auto" style={{ minWidth: "140px" }}>
          <option value="">All availability</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
          <option value="unknown">Unknown</option>
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div onClick={() => setContract(!contract)} className={cn("w-9 h-5 rounded-full relative transition-colors cursor-pointer", contract ? "bg-primary" : "bg-border")}>
            <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", contract ? "left-4.5" : "left-0.5")} />
          </div>
          <span className="text-sm text-text-dim">Contract only</span>
        </label>

        <button onClick={() => setExpanded((v) => !v)} className="btn btn-ghost btn-sm gap-1 text-text-muted">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More filters
          <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
        </button>

        <div className="ml-auto flex items-center gap-2">
          {hasFilters && (
            <button onClick={clear} className="btn btn-ghost btn-sm text-text-muted gap-1">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          <button onClick={apply} className="btn btn-primary btn-sm" disabled={isPending}>
            {isPending ? "…" : "Search"}
          </button>
        </div>
      </div>

      {/* Advanced filters */}
      {expanded && (
        <div className="flex flex-wrap gap-3 pt-1 border-t border-border">
          {/* Skills */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-dim">Skills (comma-separated)</label>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="React, Python, AWS…"
              className="input-base w-52"
            />
          </div>

          {/* Experience range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-dim">Experience (years)</label>
            <div className="flex items-center gap-1.5">
              <input type="number" value={minExp} onChange={(e) => setMinExp(e.target.value)} placeholder="Min" min="0" max="30" className="input-base w-16 text-center" />
              <span className="text-text-dim text-xs">–</span>
              <input type="number" value={maxExp} onChange={(e) => setMaxExp(e.target.value)} placeholder="Max" min="0" max="30" className="input-base w-16 text-center" />
            </div>
          </div>

          {/* Source */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-dim">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="input-base w-36">
              {SOURCES.map((s) => <option key={s} value={s}>{s || "All sources"}</option>)}
            </select>
          </div>

          {/* Work mode */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-dim">Work mode preference</label>
            <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} className="input-base w-36">
              {WORK_MODES.map((m) => <option key={m} value={m}>{m || "Any mode"}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
