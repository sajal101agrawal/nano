"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDate, formatRelativeTime, cn } from "@/lib/cn";
import type { FollowUpReminder } from "@/types";

type ReminderRow = FollowUpReminder & {
  candidate_name: string | null;
  requirement_title: string | null;
  assignee_name: string | null;
};

export default function RemindersPage() {
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "overdue" | "done">("pending");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ mine: "true" });
    if (tab === "overdue") params.set("overdue", "true");
    if (tab === "done") params.set("completed", "true");
    fetch(`/api/admin/reminders?${params}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { data: ReminderRow[] } }) => {
        if (j.success && j.data) setReminders(j.data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tab]);

  const handleComplete = async (id: string) => {
    await fetch(`/api/admin/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Reminders</h1>
          <p className="section-subtitle">Follow-up tasks and scheduled check-ins</p>
        </div>
      </div>

      <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1 w-fit mb-5">
        {(["pending", "overdue", "done"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-primary text-white" : "text-text-dim hover:text-text-light")}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-8 text-center text-text-dim text-sm">Loading...</div>
      ) : reminders.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-text-dim text-sm">No {tab} reminders.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border">
            {reminders.map((r) => (
              <div key={r.id} className={cn("px-5 py-4 flex items-start gap-4 hover:bg-bg-hover transition-colors",
                tab === "overdue" && "border-l-2 border-l-red-400/50")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/candidates/${r.candidate_id}`} className="text-sm font-medium text-text-light hover:text-primary transition-colors">
                      {r.candidate_name || "Unknown"}
                    </Link>
                    {r.requirement_title && (
                      <span className="text-xs text-text-dim">· {r.requirement_title}</span>
                    )}
                    {r.assignee_name && (
                      <span className="text-xs text-text-dim/60">→ {r.assignee_name}</span>
                    )}
                  </div>
                  {r.note && <p className="text-xs text-text-dim mt-1">{r.note}</p>}
                  <p className={cn("text-xs mt-1", tab === "overdue" ? "text-red-400" : "text-text-dim")}>
                    Due {formatDate(r.due_at)} ({formatRelativeTime(r.due_at)})
                  </p>
                </div>
                {tab !== "done" && (
                  <button onClick={() => handleComplete(r.id)}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-dim hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/8 transition-colors shrink-0">
                    Mark done
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
