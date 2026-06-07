"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DeleteButtonProps {
  endpoint: string;
  entityLabel: string;
  confirmMessage?: string;
  /** Where to navigate after successful delete. Omit to just refresh in-place. */
  redirectTo?: string;
  /** Called after successful delete (before redirect/refresh). */
  onDeleted?: () => void;
  className?: string;
  iconSize?: "sm" | "md";
}

export default function DeleteButton({
  endpoint,
  entityLabel,
  confirmMessage,
  redirectTo,
  onDeleted,
  className,
  iconSize = "sm",
}: DeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Close modal on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleDelete = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || `Failed to delete ${entityLabel}`);
      }
      setOpen(false);
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [endpoint, entityLabel, redirectTo, onDeleted, router]);

  const iconClass = iconSize === "md" ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); setError(""); }}
        title={`Delete ${entityLabel}`}
        className={
          className ||
          "p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-400/8 transition-colors"
        }
        aria-label={`Delete ${entityLabel}`}
      >
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && setOpen(false)} />
          <div className="relative z-10 w-full max-w-sm bg-bg-secondary border border-border rounded-2xl shadow-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-400/10 border border-red-400/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="delete-dialog-title" className="text-sm font-semibold text-text-light">
                  Delete {entityLabel}
                </h3>
                <p className="text-sm text-text-dim mt-1 leading-relaxed">
                  {confirmMessage || `This will permanently delete this ${entityLabel}. This action cannot be undone.`}
                </p>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-xs text-red-400 bg-red-400/8 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg text-text-dim hover:bg-bg-hover disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
