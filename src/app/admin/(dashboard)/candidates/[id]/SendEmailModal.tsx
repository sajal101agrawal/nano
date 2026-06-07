"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";

interface SendEmailModalProps {
  /** Primary recipient display name */
  recipientName: string;
  /** Primary recipient email */
  recipientEmail: string;
  /** Target type for the API */
  targetType: "candidate" | "prospect" | "recruiter";
  /** Target entity ID */
  targetId: string;
  /** Optional requirement context */
  requirementId?: string;
  /** Pre-fill subject */
  defaultSubject?: string;
  onClose: () => void;
  onSent?: () => void;
}

// Keep backward-compat for CandidateActions which uses old prop names
interface LegacyProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  requirementId?: string;
  onClose: () => void;
  onSent?: () => void;
}

type Props = SendEmailModalProps | LegacyProps;

function normaliseProps(p: Props): SendEmailModalProps {
  if ("candidateId" in p) {
    return {
      recipientName: p.candidateName,
      recipientEmail: p.candidateEmail,
      targetType: "candidate",
      targetId: p.candidateId,
      requirementId: p.requirementId,
      onClose: p.onClose,
      onSent: p.onSent,
    };
  }
  return p;
}

interface TemplateOption { id: string; name: string; subject: string; body: string; }
interface Attachment { filename: string; content: string; contentType: string; size: number; }

const MAX_ATTACH_SIZE = 5 * 1024 * 1024; // 5 MB per file
const MAX_ATTACH_COUNT = 5;

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SendEmailModal(rawProps: Props) {
  const {
    recipientName,
    recipientEmail,
    targetType,
    targetId,
    requirementId,
    defaultSubject,
    onClose,
    onSent,
  } = normaliseProps(rawProps);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState(defaultSubject || "");
  const [body, setBody] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [ccList, setCcList] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const templateVars: Record<string, string> = {
    candidate_name: recipientName,
    name: recipientName,
    email: recipientEmail,
  };

  useEffect(() => {
    fetch("/api/admin/templates")
      .then(r => r.json())
      .then(j => { if (j.success && Array.isArray(j.data)) setTemplates(j.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find(t => t.id === selectedTemplateId);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── CC management ──────────────────────────────────────────────────────────
  const addCc = useCallback(() => {
    const emails = ccInput.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!emails.length) return;
    setCcList(prev => [...new Set([...prev, ...emails])]);
    setCcInput("");
  }, [ccInput]);

  const removeCc = (email: string) => setCcList(prev => prev.filter(e => e !== email));

  // ── Attachment management ──────────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + newAttachments.length >= MAX_ATTACH_COUNT) break;
      if (file.size > MAX_ATTACH_SIZE) { setError(`${file.name} exceeds 5 MB limit`); continue; }
      const buffer = await file.arrayBuffer();
      const b64 = Buffer.from(buffer).toString("base64");
      newAttachments.push({ filename: file.name, content: b64, contentType: file.type || "application/octet-stream", size: file.size });
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    setError("");
  };

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) { setError("Subject and body are required."); return; }
    setSending(true); setError("");
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType, targetId, requirementId: requirementId || undefined,
          templateId: selectedTemplateId || undefined,
          subject, body,
          stream: "outreach",
          cc: ccList,
          attachments: attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to send");
      setSuccess(true);
      setTimeout(() => { onSent?.(); onClose(); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  const rendered = { subject: interpolate(subject, templateVars), body: interpolate(body, templateVars) };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl bg-bg-secondary border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-text-light">Send Email</h2>
            <p className="text-xs text-text-dim mt-0.5 truncate">
              To: <span className="text-text-light">{recipientName}</span>
              {" "}<span className="text-text-dim/60">&lt;{recipientEmail}&gt;</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors shrink-0 ml-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">

          {/* Template */}
          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1.5">Template (optional)</label>
              <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors">
                <option value="">— No template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Compose / Preview tabs */}
          <div className="flex gap-1 bg-bg border border-border rounded-lg p-0.5 w-fit">
            {["Compose", "Preview"].map(tab => (
              <button key={tab} onClick={() => setPreview(tab === "Preview")}
                className={cn("px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                  (tab === "Preview") === preview ? "bg-primary text-white" : "text-text-dim hover:text-text-light")}>
                {tab}
              </button>
            ))}
          </div>

          {preview ? (
            <div className="space-y-3">
              <div className="bg-bg border border-border rounded-lg p-4">
                <p className="text-xs text-text-dim mb-1">To</p>
                <p className="text-sm text-text-light">{recipientName} &lt;{recipientEmail}&gt;</p>
                {ccList.length > 0 && (
                  <>
                    <p className="text-xs text-text-dim mt-2 mb-1">CC</p>
                    <p className="text-sm text-text-light">{ccList.join(", ")}</p>
                  </>
                )}
              </div>
              <div className="bg-bg border border-border rounded-lg p-4">
                <p className="text-xs text-text-dim mb-1">Subject</p>
                <p className="text-sm text-text-light font-medium">{rendered.subject || <span className="text-text-dim italic">No subject</span>}</p>
              </div>
              <div className="bg-bg border border-border rounded-lg p-4">
                <p className="text-xs text-text-dim mb-2">Body</p>
                <div className="text-sm text-text-light whitespace-pre-wrap leading-relaxed">
                  {rendered.body || <span className="text-text-dim italic">No body</span>}
                </div>
              </div>
              {attachments.length > 0 && (
                <div className="bg-bg border border-border rounded-lg p-4">
                  <p className="text-xs text-text-dim mb-2">Attachments ({attachments.length})</p>
                  <div className="space-y-1">
                    {attachments.map((a, i) => (
                      <p key={i} className="text-sm text-text-light">{a.filename} <span className="text-text-dim">({formatBytes(a.size)})</span></p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">Subject <span className="text-red-400">*</span></label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject..."
                  className="w-full px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors" />
              </div>

              {/* CC */}
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">CC (optional)</label>
                <div className="flex gap-2">
                  <input type="email" value={ccInput} onChange={e => setCcInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addCc(); } }}
                    placeholder="email@example.com, another@example.com"
                    className="flex-1 px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors" />
                  <button onClick={addCc} type="button"
                    className="px-3 py-2 text-xs font-medium border border-border rounded-lg text-text-dim hover:bg-bg-hover hover:text-text-light transition-colors shrink-0">
                    Add
                  </button>
                </div>
                {ccList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ccList.map(email => (
                      <span key={email} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-bg-hover border border-border rounded-md text-text-dim">
                        {email}
                        <button onClick={() => removeCc(email)} className="hover:text-red-400 transition-colors ml-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">Body <span className="text-red-400">*</span></label>
                <textarea value={body} onChange={e => setBody(e.target.value)}
                  placeholder={"Write your message...\n\nUse {{candidate_name}} for dynamic values."}
                  rows={10}
                  className="w-full px-3 py-2 bg-bg text-text-light text-sm border border-border rounded-lg placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y transition-colors font-mono" />
                <p className="text-xs text-text-dim mt-1">
                  Variables: <code className="text-primary/80">{"{{candidate_name}}"}</code>
                </p>
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1.5">
                  Attachments <span className="text-text-dim/50">(up to {MAX_ATTACH_COUNT} files, 5 MB each)</span>
                </label>
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACH_COUNT}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg text-text-dim hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors w-full justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  Attach files
                </button>
                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-bg border border-border rounded-lg">
                        <svg className="w-3.5 h-3.5 text-text-dim shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <span className="text-xs text-text-light truncate flex-1">{a.filename}</span>
                        <span className="text-xs text-text-dim shrink-0">{formatBytes(a.size)}</span>
                        <button onClick={() => removeAttachment(i)} className="text-text-dim hover:text-red-400 transition-colors shrink-0">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Email queued successfully.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-dim hover:text-text-light border border-border rounded-lg hover:bg-bg-hover transition-colors">
            Cancel
          </button>
          <button onClick={handleSend} disabled={sending || success || !subject.trim() || !body.trim()}
            className={cn("inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors",
              sending || success || !subject.trim() || !body.trim()
                ? "bg-primary/40 text-white/60 cursor-not-allowed"
                : "bg-primary hover:bg-primary/90 text-white")}>
            {sending ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send Email</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
