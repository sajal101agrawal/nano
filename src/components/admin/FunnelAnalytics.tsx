"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";

type FunnelStage = { status: string; count: number; drop_pct: number };
type SourceBreakdown = { source: string; count: number };
type DailyVolume = { date: string; count: number };

type AnalyticsData = {
  funnel: FunnelStage[];
  sources: SourceBreakdown[];
  daily_volume: DailyVolume[];
  total: number;
  placed: number;
  rejected: number;
  avg_time_to_place_days: number | null;
};

const STAGE_COLORS: Record<string, string> = {
  applied:       "bg-blue-500/20 text-blue-400",
  shortlisted:   "bg-purple-500/20 text-purple-400",
  contacted:     "bg-violet-500/20 text-violet-400",
  in_discussion: "bg-amber-500/20 text-amber-400",
  offered:       "bg-orange-500/20 text-orange-400",
  placed:        "bg-emerald-500/20 text-emerald-400",
};

const BAR_COLORS: Record<string, string> = {
  applied:       "bg-blue-500/60",
  shortlisted:   "bg-purple-500/60",
  contacted:     "bg-violet-500/60",
  in_discussion: "bg-amber-500/60",
  offered:       "bg-orange-500/60",
  placed:        "bg-emerald-500/60",
};

export default function FunnelAnalytics({ requirementId }: { requirementId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/requirements/${requirementId}/analytics`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: AnalyticsData }) => {
        if (j.success && j.data) setData(j.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [requirementId]);

  if (loading) {
    return <div className="rounded-xl border border-border bg-bg-secondary p-5 text-center text-text-dim text-sm">Loading analytics...</div>;
  }

  if (!data || data.total === 0) {
    return <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center text-text-dim text-sm">No application data yet.</div>;
  }

  const maxCount = Math.max(...data.funnel.map((s) => s.count));

  return (
    <div className="space-y-4">
      {/* Funnel */}
      <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-light">Application Funnel</h3>
        <div className="space-y-2">
          {data.funnel.map((stage) => (
            <div key={stage.status} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={cn("px-2 py-0.5 rounded-md border text-[11px] font-medium capitalize",
                  STAGE_COLORS[stage.status] || "bg-bg-hover text-text-dim border-border")}>
                  {stage.status.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-3">
                  {stage.drop_pct > 0 && (
                    <span className="text-text-dim/60 text-[10px]">-{stage.drop_pct}% drop</span>
                  )}
                  <span className="font-mono font-bold text-text-light">{stage.count}</span>
                </div>
              </div>
              <div className="h-3 bg-bg-hover rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", BAR_COLORS[stage.status] || "bg-text-dim/30")}
                  style={{ width: maxCount > 0 ? `${(stage.count / maxCount) * 100}%` : "0%" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Applications", value: data.total, color: "text-text-light" },
          { label: "Placed", value: data.placed, color: "text-emerald-400" },
          { label: "Rejected", value: data.rejected, color: "text-gray-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-bg-secondary p-3 text-center">
            <p className={cn("text-xl font-bold font-display tabular-nums", s.color)}>{s.value}</p>
            <p className="text-[10px] text-text-dim mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Source breakdown */}
      {data.sources.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-light">Source Breakdown</h3>
          <div className="space-y-2">
            {data.sources.map((s) => {
              const pct = data.total > 0 ? Math.round((s.count / data.total) * 100) : 0;
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="text-xs text-text-dim w-24 truncate capitalize">{s.source || "unknown"}</span>
                  <div className="flex-1 h-1.5 bg-bg-hover rounded-full overflow-hidden">
                    <div className="h-full bg-primary/50 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-text-dim w-12 text-right">{s.count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily volume (simple sparkline-style) */}
      {data.daily_volume.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-light">Application Volume (last 60d)</h3>
          <div className="flex items-end gap-0.5 h-16">
            {data.daily_volume.map((d, i) => {
              const maxVol = Math.max(...data.daily_volume.map((x) => x.count));
              const heightPct = maxVol > 0 ? (d.count / maxVol) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex items-end" title={`${d.date}: ${d.count}`}>
                  <div className="w-full bg-primary/40 rounded-sm" style={{ height: `${Math.max(4, heightPct)}%` }} />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-text-dim text-right">Daily applications</p>
        </div>
      )}
    </div>
  );
}
