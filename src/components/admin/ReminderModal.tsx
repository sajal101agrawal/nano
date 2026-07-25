"use client";

import React, { useState } from "react";

interface Props {
  candidateId: string;
  candidateName: string;
  applicationId?: string;
  requirementId?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ReminderModal({ candidateId, candidateName, applicationId, requirementId, onClose, onSaved }: Props) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  const [dueAt, setDueAt] = useState(tomorrow);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueAt) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, application_id: applicationId, requirement_id: requirementId, due_at: dueAt, note }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || "Failed");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-text-light text-base">Set Reminder</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-light hover:bg-bg-hover transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-text-dim">Follow up on <span className="text-text-light font-medium">{candidateName}</span></p>

          <div>
            <label className="text-xs text-text-dim mb-1 block">Due date & time</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs text-text-dim mb-1 block">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What to follow up on..."
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light placeholder:text-text-muted resize-none focus:outline-none focus:border-primary/50"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : "Set Reminder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
