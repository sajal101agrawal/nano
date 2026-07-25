"use client";

import React, { useState, useEffect } from "react";
import { formatRelativeTime, cn } from "@/lib/cn";
import NoteForm from "@/components/admin/NoteForm";
import StarRating from "@/components/admin/StarRating";
import type { CandidateNote, CandidateTag } from "@/types";

const TAG_COLOR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  green:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  amber:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  red:    "bg-red-500/10 text-red-400 border-red-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pink:   "bg-pink-500/10 text-pink-400 border-pink-500/20",
  gray:   "bg-gray-500/10 text-gray-400 border-gray-500/20",
  cyan:   "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const TAG_COLORS = Object.keys(TAG_COLOR_CLASSES);

interface Props {
  candidateId: string;
}

export default function CandidateNotesAndTags({ candidateId }: Props) {
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [tags, setTags] = useState<CandidateTag[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingTags, setLoadingTags] = useState(true);

  // Tag input state
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState("blue");
  const [addingTag, setAddingTag] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/candidates/${candidateId}/notes`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CandidateNote[] }) => {
        if (j.success && j.data) setNotes(j.data);
        setLoadingNotes(false);
      })
      .catch(() => setLoadingNotes(false));

    fetch(`/api/admin/candidates/${candidateId}/tags`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CandidateTag[] }) => {
        if (j.success && j.data) setTags(j.data);
        setLoadingTags(false);
      })
      .catch(() => setLoadingTags(false));
  }, [candidateId]);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    setAddingTag(true);
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tagInput.trim(), color: tagColor }),
      });
      const json = await res.json() as { success: boolean; data?: CandidateTag };
      if (json.success && json.data) {
        setTags((prev) => [...prev.filter((t) => t.tag !== json.data!.tag), json.data!]);
        setTagInput("");
      }
    } catch { /* ignore */ } finally {
      setAddingTag(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    setTags((prev) => prev.filter((t) => t.tag !== tag));
    await fetch(`/api/admin/candidates/${candidateId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    }).catch(() => null);
  };

  return (
    <div className="space-y-5">
      {/* Tags */}
      <section className="bg-bg-secondary border border-border rounded-xl p-5">
        <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">Tags</h3>

        {loadingTags ? (
          <div className="h-4 bg-bg-hover rounded animate-pulse w-24" />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((t) => (
                <span
                  key={t.id}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border",
                    TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.gray
                  )}
                >
                  {t.tag}
                  <button
                    onClick={() => handleRemoveTag(t.tag)}
                    className="opacity-60 hover:opacity-100 transition-opacity ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-text-dim/50">No tags yet</span>
              )}
            </div>

            <form onSubmit={handleAddTag} className="flex items-center gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-text-light placeholder:text-text-muted focus:outline-none focus:border-primary/50"
              />
              <select
                value={tagColor}
                onChange={(e) => setTagColor(e.target.value)}
                className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-dim focus:outline-none focus:border-primary/50"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!tagInput.trim() || addingTag}
                className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-xs text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </form>
          </>
        )}
      </section>

      {/* Notes */}
      <section className="bg-bg-secondary border border-border rounded-xl p-5">
        <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">Notes</h3>

        <NoteForm
          candidateId={candidateId}
          onAdded={(note) => setNotes((prev) => [note, ...prev])}
          compact
        />

        {loadingNotes ? (
          <div className="mt-3 space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-10 bg-bg-hover rounded animate-pulse" />)}
          </div>
        ) : notes.length > 0 ? (
          <div className="mt-3 space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-bg p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-text-dim">
                    {(note as CandidateNote & { author_name?: string }).author_name || "You"}
                  </span>
                  <div className="flex items-center gap-2">
                    {note.visibility === "private" && (
                      <span className="text-[10px] text-text-muted/60 border border-border rounded px-1">private</span>
                    )}
                    <span className="text-[10px] text-text-dim/50">{formatRelativeTime(note.created_at)}</span>
                  </div>
                </div>
                <p className="text-sm text-text-light leading-relaxed whitespace-pre-wrap">{note.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-text-dim/50">No notes yet.</p>
        )}
      </section>
    </div>
  );
}
