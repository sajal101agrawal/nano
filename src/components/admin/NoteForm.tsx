"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import type { CandidateNote } from "@/types";

interface Props {
  candidateId: string;
  applicationId?: string;
  requirementId?: string;
  onAdded?: (note: CandidateNote) => void;
  compact?: boolean;
}

export default function NoteForm({ candidateId, applicationId, requirementId, onAdded, compact }: Props) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), application_id: applicationId, requirement_id: requirementId, visibility }),
      });
      const json = await res.json() as { success: boolean; data?: CandidateNote; error?: string };
      if (!json.success) throw new Error(json.error || "Failed");
      setBody("");
      onAdded?.(json.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note..."
        rows={compact ? 2 : 3}
        className={cn(
          "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-light placeholder:text-text-muted resize-none",
          "focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
        )}
      />
      {body.trim() && (
        <div className="flex items-center justify-between gap-2">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "team" | "private")}
            className="text-xs border border-border bg-bg rounded-md px-2 py-1 text-text-dim focus:outline-none focus:border-primary/50"
          >
            <option value="team">Team visible</option>
            <option value="private">Private</option>
          </select>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button
              type="button"
              onClick={() => setBody("")}
              className="text-xs text-text-dim hover:text-text-light transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="px-3 py-1 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save note"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
