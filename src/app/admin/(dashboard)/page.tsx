import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import Link from "next/link";
import { formatRelativeTime, applicationStatusBadgeClass } from "@/lib/cn";
import {
  Users,
  Briefcase,
  Zap,
  AlertCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  CheckCircle,
} from "lucide-react";

async function getStats() {
  const [total, available, reqs, weekApps, recentApps, failures, overdueReminders, pipelineHealth] = await Promise.all([
    query<{ count: string }>("SELECT COUNT(*) AS count FROM candidates WHERE status='active'"),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM candidates WHERE status='active' AND availability_status='available'"),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM requirements WHERE status='open'"),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM applications WHERE applied_at > NOW() - INTERVAL '7 days'"),
    query<{
      id: string; candidate_id: string; requirement_id: string;
      candidate_name: string; requirement_title: string; status: string; applied_at: string;
    }>(
      `SELECT a.id, a.candidate_id, a.requirement_id, c.full_name AS candidate_name,
              r.title AS requirement_title, a.status, a.applied_at
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN requirements r ON r.id = a.requirement_id
       ORDER BY a.applied_at DESC LIMIT 8`
    ),
    query<{ id: string; candidate_id: string; candidate_name: string; parse_error: string; created_at: string }>(
      `SELECT cp.id, cp.candidate_id, c.full_name AS candidate_name, cp.parse_error, cp.created_at
       FROM candidate_profiles cp
       JOIN candidates c ON c.id = cp.candidate_id
       WHERE cp.parse_status IN ('failed','review_required')
       ORDER BY cp.created_at DESC LIMIT 5`
    ),
    query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM follow_up_reminders WHERE due_at < NOW() AND completed_at IS NULL"
    ).catch(() => [{ count: "0" }]),
    query<{ id: string; title: string; total: string; shortlisted: string; contacted: string; in_discussion: string }>(
      `SELECT r.id, r.title,
              COUNT(a.id)::text AS total,
              COUNT(a.id) FILTER (WHERE a.status = 'shortlisted')::text AS shortlisted,
              COUNT(a.id) FILTER (WHERE a.status = 'contacted')::text AS contacted,
              COUNT(a.id) FILTER (WHERE a.status = 'in_discussion')::text AS in_discussion
       FROM requirements r
       LEFT JOIN applications a ON a.requirement_id = r.id
       WHERE r.status = 'open'
       GROUP BY r.id
       ORDER BY COUNT(a.id) DESC
       LIMIT 5`
    ).catch(() => []),
  ]);

  return {
    totalCandidates: parseInt(total[0]?.count || "0"),
    available: parseInt(available[0]?.count || "0"),
    openReqs: parseInt(reqs[0]?.count || "0"),
    weekApps: parseInt(weekApps[0]?.count || "0"),
    recentApps,
    failures,
    overdueReminders: parseInt(overdueReminders[0]?.count || "0"),
    pipelineHealth,
  };
}

export default async function AdminDashboard() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const stats = await getStats();

  const statCards = [
    {
      label: "Candidates",
      value: stats.totalCandidates,
      sub: `${stats.available} available`,
      icon: Users,
      color: "bg-blue-500/15 text-blue-400",
      href: "/admin/candidates",
    },
    {
      label: "Open Roles",
      value: stats.openReqs,
      sub: "active requirements",
      icon: Briefcase,
      color: "bg-violet-500/15 text-violet-400",
      href: "/admin/requirements",
    },
    {
      label: "Available Now",
      value: stats.available,
      sub: "ready to engage",
      icon: Zap,
      color: "bg-emerald-500/15 text-emerald-400",
      href: "/admin/candidates?availability=available",
    },
    {
      label: "This Week",
      value: stats.weekApps,
      sub: "new applications",
      icon: TrendingUp,
      color: "bg-amber-500/15 text-amber-400",
      href: "/admin/requirements",
    },
  ];

  const overdueCard = stats.overdueReminders > 0 ? {
    label: "Overdue Tasks",
    value: stats.overdueReminders,
    sub: "need attention",
    icon: AlertCircle,
    color: "bg-red-500/15 text-red-400",
    href: "/admin/reminders",
  } : null;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">Welcome back, {session.name}</p>
        </div>
        <Link
          href="/admin/requirements/new"
          className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          New Requirement
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="stat-card group">
              <div className="flex items-start justify-between mb-3">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", card.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0 mt-0.5" />
              </div>
              <div className="font-display text-2xl font-bold text-text-light tabular-nums">
                {card.value.toLocaleString()}
              </div>
              <div className="text-sm text-text-light mt-0.5">{card.label}</div>
              <div className="text-xs text-text-muted mt-0.5">{card.sub}</div>
            </Link>
          );
        })}
      </div>

      {/* Quick links strip */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { label: "New Requirement", href: "/admin/requirements/new", primary: true },
          { label: "Search Candidates", href: "/admin/candidates" },
          { label: "Send Email", href: "/admin/email" },
          { label: "View Analytics", href: "/admin/analytics" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "btn btn-sm",
              link.primary ? "btn-primary" : "btn-secondary"
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Overdue reminder alert */}
      {stats.overdueReminders > 0 && (
        <Link href="/admin/reminders" className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/8 text-red-400 hover:bg-red-500/12 transition-colors">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">{stats.overdueReminders} overdue follow-up reminder{stats.overdueReminders !== 1 ? "s" : ""} need attention</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto" />
        </Link>
      )}

      {/* Pipeline health */}
      {stats.pipelineHealth.length > 0 && (
        <div className="card overflow-hidden mb-0">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold text-text-light text-[15px]">Pipeline Health</h2>
            <Link href="/admin/requirements" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {stats.pipelineHealth.map((job) => (
              <Link key={job.id} href={`/admin/requirements/${job.id}`} className="flex items-center gap-4 px-5 py-3 table-row-hover">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-light truncate">{job.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">{job.total} total · {job.shortlisted} shortlisted · {job.contacted} contacted · {job.in_discussion} in discussion</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[{ v: job.total, c: "bg-text-dim/20" }, { v: job.shortlisted, c: "bg-purple-500/50" }, { v: job.contacted, c: "bg-violet-500/50" }, { v: job.in_discussion, c: "bg-amber-500/50" }].map((s, i) => (
                    <div key={i} className="text-center w-8">
                      <div className={cn("text-xs font-bold tabular-nums", i === 0 ? "text-text-dim" : i === 1 ? "text-purple-400" : i === 2 ? "text-violet-400" : "text-amber-400")}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Applications */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold text-text-light text-[15px]">
              Recent Applications
            </h2>
            <Link
              href="/admin/requirements"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {stats.recentApps.length === 0 ? (
            <div className="empty-state py-10">
              <div className="empty-icon">
                <Briefcase className="w-5 h-5 text-text-muted" />
              </div>
              <p className="empty-title">No applications yet</p>
              <p className="empty-desc">Create a requirement and share the link to start receiving applications.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.recentApps.map((app) => (
                <div
                  key={app.id}
                  className="px-5 py-3 flex items-center justify-between gap-4 table-row-hover"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/candidates/${app.candidate_id}`}
                      className="text-sm font-medium text-text-light hover:text-primary transition-colors truncate block"
                    >
                      {app.candidate_name || "Unknown"}
                    </Link>
                    <Link
                      href={`/admin/requirements/${app.requirement_id}`}
                      className="text-xs text-text-muted hover:text-text-dim transition-colors truncate block mt-0.5"
                    >
                      {app.requirement_title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={applicationStatusBadgeClass(app.status)}>
                      {app.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-text-muted hidden sm:block">
                      {formatRelativeTime(app.applied_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parse Failures */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="font-display font-semibold text-text-light text-[15px]">
              Needs Review
            </h2>
          </div>

          {stats.failures.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-sm text-text-dim">All CVs parsed successfully</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.failures.map((f) => (
                <Link
                  key={f.id}
                  href={`/admin/candidates/${f.candidate_id}`}
                  className="block px-5 py-3 table-row-hover"
                >
                  <p className="text-sm font-medium text-text-light truncate">
                    {f.candidate_name || "Unknown"}
                  </p>
                  <p className="text-xs text-red-400 mt-0.5 truncate">
                    {f.parse_error || "Parse failed"}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatRelativeTime(f.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
