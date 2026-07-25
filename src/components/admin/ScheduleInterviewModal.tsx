"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
  applicationId: string;
  candidateName: string;
  onClose: () => void;
  onScheduled?: () => void;
}

const INTERVIEW_TYPES = [
  { value: "video",     label: "Video Call" },
  { value: "phone",     label: "Phone Screen" },
  { value: "technical", label: "Technical" },
  { value: "onsite",    label: "On-site" },
  { value: "hr",        label: "HR Round" },
];

export default function ScheduleInterviewModal({ applicationId, candidateName, onClose, onScheduled }: Props) {
  const [type, setType] = useState("video");
  const [round, setRound] = useState(1);
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          interview_type: type,
          round_number: round,
          scheduled_at: scheduledAt || undefined,
          duration_minutes: duration,
          location: location || undefined,
          notes: notes || undefined,
        }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || "Failed");
      onScheduled?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-text-light text-base">Schedule Interview</h2>
            <p className="text-xs text-text-dim mt-0.5">{candidateName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-light hover:bg-bg-hover transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-dim mb-1 block">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary/50"
              >
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-dim mb-1 block">Round</label>
              <input
                type="number"
                min={1}
                max={10}
                value={round}
                onChange={(e) => setRound(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-dim mb-1 block">Date & Time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-text-dim mb-1 block">Duration (min)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary/50"
              >
                {[30, 45, 60, 90, 120].map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-dim mb-1 block">Meeting Link / Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="https://meet.google.com/... or office address"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light placeholder:text-text-muted focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs text-text-dim mb-1 block">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Topics to cover, special instructions..."
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light placeholder:text-text-muted resize-none focus:outline-none focus:border-primary/50"
            />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Scheduling..." : "Schedule Interview"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
