"use client";

import { useState } from "react";

interface CVDownloadButtonProps {
  candidateId: string;
  filename?: string;
}

export default function CVDownloadButton({ candidateId, filename }: CVDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/cv-url`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to get URL");
      const a = document.createElement("a");
      a.href = json.data.url;
      a.download = json.data.filename || filename || "cv.pdf";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-text-dim/30 border-t-text-dim rounded-full animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CV
          </>
        )}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
