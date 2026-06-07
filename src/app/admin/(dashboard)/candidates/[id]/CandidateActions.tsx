"use client";

import { useState } from "react";
import SendEmailModal from "./SendEmailModal";
import { cn } from "@/lib/cn";

interface ActionsProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
}

export default function CandidateActions({
  candidateId,
  candidateName,
  candidateEmail,
}: ActionsProps) {
  const [showEmail, setShowEmail] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkDone, setCheckDone] = useState(false);
  const [checkError, setCheckError] = useState("");

  const handleAvailabilityCheck = async () => {
    setCheckLoading(true);
    setCheckError("");
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/availability`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      setCheckDone(true);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Error");
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setShowEmail(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Send Email
        </button>

        <button
          onClick={handleAvailabilityCheck}
          disabled={checkLoading || checkDone}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors",
            checkDone
              ? "border-emerald-500/30 text-emerald-400 bg-emerald-400/10 cursor-default"
              : "border-border text-text-light hover:bg-bg-hover"
          )}
        >
          {checkLoading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-text-dim/30 border-t-text-dim rounded-full animate-spin" />
              Sending...
            </>
          ) : checkDone ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Check sent
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Check Availability
            </>
          )}
        </button>
      </div>

      {checkError && (
        <p className="text-red-400 text-xs mt-2">{checkError}</p>
      )}

      {showEmail && (
        <SendEmailModal
          candidateId={candidateId}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          onClose={() => setShowEmail(false)}
        />
      )}
    </>
  );
}
