"use client";

import { useState, useEffect, useRef } from "react";
import type { Template } from "@/types";
import { cn } from "@/lib/cn";

interface SendEmailModalProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  onClose: () => void;
  onSent?: () => void;
}

interface TemplateOption {
  id: string;
  name: string;
  template_type: string;
  subject: string;
  body: string;
}

function interpolate(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export default function SendEmailModal({
  candidateId,
  candidateName,
  candidateEmail,
  onClose,
  onSent,
}: SendEmailModalProps) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const templateVars: Record<string, string> = {
    candidate_name: candidateName,
    name: candidateName,
    email: candidateEmail,
  };

  useEffect(() => {
    fetch("/api/admin/templates")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setTemplates(json.data as TemplateOption[]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }, [selectedTemplateId, templates]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required.");
      return;
    }
    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          templateId: selectedTemplateId || undefined,
          subject,
          body,
          stream: "outreach",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to send");
      }

      setSuccess(true);
      setTimeout(() => {
        onSent?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  const renderedSubject = interpolate(subject, templateVars);
  const renderedBody = interpolate(body, templateVars);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl bg-bg-secondary border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-light">
              Send Email
            </h2>
            <p className="text-xs text-text-dim mt-0.5">
              To: {candidateName} &lt;{candidateEmail}&gt;
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1.5">
                Template (optional)
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg
                           focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              >
                <option value="">— No template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Preview toggle */}
          <div className="flex gap-1 bg-bg border border-border rounded-lg p-0.5 w-fit">
            {["Compose", "Preview"].map((tab) => (
              <button
                key={tab}
                onClick={() => setPreview(tab === "Preview")}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                  (tab === "Preview") === preview
                    ? "bg-primary text-white"
                    : "text-text-dim hover:text-text-light"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {preview ? (
            <div className="space-y-3">
              <div className="bg-bg border border-border rounded-lg p-4">
                <p className="text-xs text-text-dim mb-1">Subject</p>
                <p className="text-sm text-text-light font-medium">
                  {renderedSubject || <span className="text-text-dim italic">No subject</span>}
                </p>
              </div>
              <div className="bg-bg border border-border rounded-lg p-4">
                <p className="text-xs text-text-dim mb-2">Body</p>
                <div
                  className="text-sm text-text-light whitespace-pre-wrap leading-relaxed"
                  style={{ fontFamily: "inherit" }}
                >
                  {renderedBody || <span className="text-text-dim italic">No body</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">
                  Subject <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="w-full px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg
                             placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">
                  Body <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message... Use {{candidate_name}} for interpolation."
                  rows={10}
                  className="w-full px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg
                             placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                             resize-y transition-colors font-mono"
                />
                <p className="text-xs text-text-dim mt-1">
                  Variables: <code className="text-primary/80">{'{{candidate_name}}'}</code>
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Email queued successfully.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-dim hover:text-text-light border border-border rounded-lg hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || success || !subject.trim() || !body.trim()}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors",
              sending || success || !subject.trim() || !body.trim()
                ? "bg-primary/40 text-white/60 cursor-not-allowed"
                : "bg-primary hover:bg-primary/90 text-white"
            )}
          >
            {sending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
