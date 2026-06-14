"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, ShieldCheck } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
}

interface Template {
  id: string;
  name: string;
  template_type: string;
}

interface Props {
  companyId: string;
  companyName: string;
  users: User[];
  templates: Template[];
  isVerified: boolean;
}

export function CompanyDetailActions({ companyId, companyName, users, templates, isVerified }: Props) {
  const router = useRouter();
  const [showEmail, setShowEmail] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendAll, setSendAll] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [customMsg, setCustomMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    try {
      await fetch(`/api/admin/staffing/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: !isVerified }),
      });
      router.refresh();
    } catch {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete company "${companyName}" and all their data? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/staffing/companies/${companyId}`, { method: "DELETE" });
      router.push("/admin/staffing/companies");
    } catch {
      setDeleting(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/admin/staffing/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          recipientType: sendAll ? "company_all" : "specific_users",
          userIds: sendAll ? undefined : selectedUsers,
          templateId: templateId || undefined,
          subject,
          bodyHtml: bodyHtml || undefined,
          variables: { custom_message: customMsg },
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to send");
      } else {
        setSent(true);
        setTimeout(() => { setSent(false); setShowEmail(false); }, 2000);
      }
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-2">
        <button
          type="button"
          onClick={() => setShowEmail(!showEmail)}
          className="btn btn-primary w-full inline-flex items-center justify-center gap-1.5"
        >
          <Mail className="w-3.5 h-3.5" />
          Send Email
        </button>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className={`btn w-full inline-flex items-center justify-center gap-1.5 ${isVerified ? "btn-secondary" : "btn-secondary"}`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {isVerified ? "Mark as Unverified" : "Mark as Verified"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn btn-ghost w-full text-red-400 hover:bg-red-500/10 inline-flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Company
        </button>
      </div>

      {showEmail && (
        <div className="card p-5">
          <h3 className="font-display font-semibold text-text-light text-sm mb-3">Compose Email</h3>
          <form onSubmit={handleSendEmail} className="space-y-3">
            <div>
              <label className="form-label">Recipients</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSendAll(true)}
                  className={`btn btn-sm flex-1 ${sendAll ? "btn-primary" : "btn-secondary"}`}
                >
                  All users ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSendAll(false)}
                  className={`btn btn-sm flex-1 ${!sendAll ? "btn-primary" : "btn-secondary"}`}
                >
                  Select users
                </button>
              </div>
              {!sendAll && users.length > 0 && (
                <div className="mt-2 space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(u.id)}
                        onChange={(e) => {
                          setSelectedUsers((prev) =>
                            e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                          );
                        }}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-sm text-text-dim">{u.name} <span className="text-text-muted">({u.email})</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Template (optional)</label>
              <select
                className="input-base w-full"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="input-base w-full"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="Email subject"
              />
            </div>

            <div>
              <label className="form-label">Custom message</label>
              <textarea
                rows={4}
                className="input-base w-full"
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="Your message (injected as {{custom_message}} in templates, or used as body if no template)"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {sent && <p className="text-sm text-emerald-400">Email sent successfully!</p>}

            <button type="submit" className="btn btn-primary w-full" disabled={sending}>
              {sending ? "Sending..." : "Send Email"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
