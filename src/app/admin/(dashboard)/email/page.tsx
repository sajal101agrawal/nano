import { query } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatRelativeTime } from "@/lib/cn";
import Link from "next/link";
import { Mail, LayoutTemplate, Send } from "lucide-react";

function streamBadge(stream: string) {
  const map: Record<string, string> = {
    transactional: "badge-blue",
    outreach: "badge-purple",
    availability: "badge-green",
  };
  return `badge ${map[stream] || "badge-gray"}`;
}

function statusDot(status: string) {
  const map: Record<string, string> = {
    sent: "bg-blue-400",
    delivered: "bg-blue-500",
    opened: "bg-emerald-500",
    clicked: "bg-emerald-500",
    bounced: "bg-red-500",
    failed: "bg-red-500",
    queued: "bg-amber-500",
    replied: "bg-violet-500",
  };
  return map[status] || "bg-gray-400";
}

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [messages, templates, emailStats] = await Promise.all([
    query<{
      id: string; target_type: string; email_to: string; subject: string;
      status: string; stream: string; sent_at: string; created_at: string;
    }>(
      "SELECT id, target_type, email_to, subject, status, stream, sent_at, created_at FROM outreach_messages ORDER BY created_at DESC LIMIT 50"
    ),
    query<{ id: string; name: string; template_type: string; updated_at: string }>(
      "SELECT id, name, template_type, updated_at FROM templates ORDER BY name"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM outreach_messages GROUP BY status"
    ),
  ]);

  const sent = parseInt(emailStats.find((e) => e.status === "sent")?.count || "0");
  const delivered = parseInt(emailStats.find((e) => e.status === "delivered")?.count || "0");
  const opened = parseInt(emailStats.find((e) => e.status === "opened")?.count || "0");
  const bounced = parseInt(emailStats.find((e) => e.status === "bounced")?.count || "0");

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Email Centre</h1>
          <p className="section-subtitle">Send, track, and manage email campaigns</p>
        </div>
        <Link href="/admin/email/compose" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5" />
          Compose
        </Link>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Sent", value: sent, color: "text-blue-400" },
          { label: "Delivered", value: delivered, color: "text-blue-500" },
          { label: "Opened", value: opened, color: "text-emerald-400" },
          { label: "Bounced", value: bounced, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="stat-card py-3 px-4 text-center">
            <div className={`font-display text-xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sent messages */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Mail className="w-4 h-4 text-text-muted" />
            <h2 className="font-display font-semibold text-text-light text-[15px]">Sent Messages</h2>
          </div>
          {messages.length === 0 ? (
            <div className="empty-state py-12">
              <div className="empty-icon"><Mail className="w-5 h-5 text-text-muted" /></div>
              <p className="empty-title">No messages sent yet</p>
              <p className="empty-desc">Send emails to candidates and recruiters from here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((msg) => (
                <div key={msg.id} className="px-5 py-3 flex items-start justify-between gap-4 table-row-hover">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-light truncate">{msg.subject}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-text-muted truncate">{msg.email_to}</span>
                      <span className={streamBadge(msg.stream)}>{msg.stream}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className={`w-1.5 h-1.5 rounded-full ${statusDot(msg.status)}`} />
                      <span className="text-xs text-text-dim capitalize">{msg.status}</span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatRelativeTime(msg.sent_at || msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Templates */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-text-muted" />
              <h2 className="font-display font-semibold text-text-light text-[15px]">Templates</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {templates.map((t) => (
              <div key={t.id} className="px-5 py-3 table-row-hover">
                <p className="text-sm font-medium text-text-light">{t.name}</p>
                <p className="text-xs text-text-muted mt-0.5 capitalize">
                  {t.template_type.replace(/_/g, " ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
