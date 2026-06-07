import { query } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatRelativeTime } from "@/lib/cn";
import Link from "next/link";
import { Bell, BriefcaseIcon, AlertCircle, Mail, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

const typeIcon: Record<string, React.ReactNode> = {
  new_application: <BriefcaseIcon className="w-3.5 h-3.5" />,
  parse_failed:    <AlertCircle className="w-3.5 h-3.5" />,
  availability_changed: <Zap className="w-3.5 h-3.5" />,
  email_reply:     <Mail className="w-3.5 h-3.5" />,
  system:          <Bell className="w-3.5 h-3.5" />,
};

const typeColor: Record<string, string> = {
  new_application: "bg-blue-500/15 text-blue-400",
  parse_failed:    "bg-amber-500/15 text-amber-400",
  availability_changed: "bg-emerald-500/15 text-emerald-400",
  email_reply:     "bg-violet-500/15 text-violet-400",
  system:          "bg-gray-500/15 text-gray-400",
};

export default async function NotificationsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const notifications = await query<{
    id: string; type: string; title: string; body: string;
    entity_type: string; entity_id: string; read: boolean; created_at: string;
  }>(
    `SELECT id, type, title, body, entity_type, entity_id, read, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY read ASC, created_at DESC LIMIT 100`,
    [session.userId]
  );

  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);

  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Notifications</h1>
          <p className="section-subtitle">
            {unread.length > 0 ? `${unread.length} unread` : "All caught up"}
          </p>
        </div>
        {unread.length > 0 && (
          <form action={async () => {
            "use server";
            const { query: dbQ } = await import("@/lib/db");
            const { getAdminSession: getS } = await import("@/lib/auth");
            const s = await getS();
            if (s) await dbQ("UPDATE notifications SET read = TRUE WHERE user_id = $1", [s.userId]);
          }}>
            <button type="submit" className="btn btn-ghost btn-sm text-primary">
              Mark all read
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><Bell className="w-5 h-5 text-text-muted" /></div>
            <p className="empty-title">No notifications</p>
            <p className="empty-desc">You're all caught up! Notifications will appear here when there's activity.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {unread.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 px-1">Unread</p>
              <div className="card overflow-hidden">
                {unread.map((n) => {
                  const href = n.entity_type && n.entity_id
                    ? (n.entity_type === "candidate" || n.entity_type === "candidate_profile")
                      ? `/admin/candidates/${n.entity_id}`
                      : n.entity_type === "requirement"
                      ? `/admin/requirements/${n.entity_id}`
                      : "/admin"
                    : "/admin";
                  const color = typeColor[n.type] || "bg-gray-500/15 text-gray-400";
                  return (
                    <Link key={n.id} href={href} className="flex items-start gap-3 px-5 py-4 border-b border-border last:border-0 table-row-hover bg-primary/[0.02]">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
                        {typeIcon[n.type] || <Bell className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-light">{n.title}</p>
                        {n.body && <p className="text-xs text-text-muted mt-0.5 truncate">{n.body}</p>}
                        <p className="text-xs text-text-muted mt-1">{formatRelativeTime(n.created_at)}</p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {read.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 px-1">Earlier</p>
              <div className="card overflow-hidden">
                {read.map((n) => {
                  const href = n.entity_type && n.entity_id
                    ? (n.entity_type === "candidate" || n.entity_type === "candidate_profile")
                      ? `/admin/candidates/${n.entity_id}`
                      : n.entity_type === "requirement"
                      ? `/admin/requirements/${n.entity_id}`
                      : "/admin"
                    : "/admin";
                  const color = typeColor[n.type] || "bg-gray-500/15 text-gray-400";
                  return (
                    <Link key={n.id} href={href} className="flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0 table-row-hover opacity-70">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
                        {typeIcon[n.type] || <Bell className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-light">{n.title}</p>
                        {n.body && <p className="text-xs text-text-muted mt-0.5 truncate">{n.body}</p>}
                        <p className="text-xs text-text-muted mt-1">{formatRelativeTime(n.created_at)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
