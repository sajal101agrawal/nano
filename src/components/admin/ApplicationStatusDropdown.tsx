"use client";

import React from "react";
import { cn } from "@/lib/cn";

const STATUS_OPTIONS = [
  { value: "applied",       label: "Applied" },
  { value: "shortlisted",   label: "Shortlisted" },
  { value: "contacted",     label: "Contacted" },
  { value: "in_discussion", label: "In Discussion" },
  { value: "offered",       label: "Offered" },
  { value: "placed",        label: "Placed" },
  { value: "rejected",      label: "Rejected" },
  { value: "withdrawn",     label: "Withdrawn" },
];

const STATUS_COLORS: Record<string, string> = {
  applied:       "bg-blue-500/10 text-blue-400 border-blue-500/25",
  shortlisted:   "bg-purple-500/10 text-purple-400 border-purple-500/25",
  contacted:     "bg-violet-500/10 text-violet-400 border-violet-500/25",
  in_discussion: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  offered:       "bg-orange-500/10 text-orange-400 border-orange-500/25",
  placed:        "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  rejected:      "bg-gray-500/10 text-gray-400 border-gray-500/25",
  withdrawn:     "bg-gray-500/10 text-gray-400 border-gray-500/25",
  parsing:       "bg-blue-500/10 text-blue-400 border-blue-500/25",
  parsed:        "bg-green-500/10 text-green-400 border-green-500/25",
  parse_failed:  "bg-red-500/10 text-red-400 border-red-500/25",
};

interface Props {
  status: string;
  onChangeStatus: (status: string) => void;
  loading?: boolean;
  compact?: boolean;
}

export default function ApplicationStatusDropdown({ status, onChangeStatus, loading, compact }: Props) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const colorClass = STATUS_COLORS[status] || "bg-gray-500/10 text-gray-400 border-gray-500/25";
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status.replace(/_/g, " ");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border transition-opacity cursor-pointer",
          colorClass,
          compact ? "text-[10px] px-1.5" : "",
          loading && "opacity-50 cursor-not-allowed"
        )}
      >
        {label}
        <svg className="w-2.5 h-2.5 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 min-w-[150px] rounded-lg border border-border bg-bg-secondary shadow-xl py-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChangeStatus(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs transition-colors",
                opt.value === status
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
  );
}
