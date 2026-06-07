import { query } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Users, Briefcase, Zap, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [pool, availability, funnel, reqStatus, emailStats, topSkills, weeklyGrowth] = await Promise.all([
    query<{ total: string; active: string; last30d: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='active') AS active,
              COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '30 days') AS last30d
       FROM candidates`
    ),
    query<{ availability_status: string; count: string }>(
      "SELECT availability_status, COUNT(*) AS count FROM candidates WHERE status='active' GROUP BY availability_status"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM applications GROUP BY status ORDER BY count DESC LIMIT 8"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM requirements GROUP BY status"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM outreach_messages GROUP BY status"
    ),
    query<{ skill: string; count: string }>(
      "SELECT skill, COUNT(*) AS count FROM candidate_skills GROUP BY skill ORDER BY count DESC LIMIT 15"
    ),
    query<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS count
       FROM candidates WHERE created_at > NOW()-INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`
    ),
  ]);

  const p = pool[0] || { total: "0", active: "0", last30d: "0" };
  const totalApps = funnel.reduce((s, f) => s + parseInt(f.count), 0);
  const openReqs = reqStatus.find((r) => r.status === "open")?.count || "0";
  const availableCount = parseInt(availability.find((a) => a.availability_status === "available")?.count || "0");
  const totalActive = parseInt(p.active);
  const maxWeek = Math.max(...weeklyGrowth.map((w) => parseInt(w.count)), 1);
  const maxSkillCount = Math.max(...topSkills.map((s) => parseInt(s.count)), 1);

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="section-title">Analytics</h1>
        <p className="section-subtitle">Platform performance overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger">
        {[
          { label: "Total Candidates", value: p.total, sub: `+${p.last30d} this month`, icon: Users, color: "bg-blue-500/15 text-blue-400" },
          { label: "Active Candidates", value: p.active, sub: "not deleted", icon: Users, color: "bg-indigo-500/15 text-indigo-400" },
          { label: "Available Now", value: String(availableCount), sub: "ready to engage", icon: Zap, color: "bg-emerald-500/15 text-emerald-400" },
          { label: "Open Roles", value: openReqs, sub: "active requirements", icon: Briefcase, color: "bg-violet-500/15 text-violet-400" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="font-display text-2xl font-bold text-text-light tabular-nums">{s.value}</div>
              <div className="text-sm text-text-light mt-0.5">{s.label}</div>
              <div className="text-xs text-text-muted mt-0.5">{s.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Availability breakdown */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-text-light text-[15px] mb-4">Availability Breakdown</h2>
          <div className="space-y-3">
            {[
              { key: "available", label: "Available", color: "bg-emerald-500" },
              { key: "unavailable", label: "Unavailable", color: "bg-red-500" },
              { key: "unknown", label: "Unknown", color: "bg-amber-500" },
            ].map(({ key, label, color }) => {
              const count = parseInt(availability.find((a) => a.availability_status === key)?.count || "0");
              const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-text-light">{label}</span>
                    <span className="text-text-muted tabular-nums">{count} ({pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className={`progress-bar-fill ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Application funnel */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-text-light text-[15px] mb-4">Application Funnel</h2>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.status} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-text-dim capitalize">{f.status.replace(/_/g, " ")}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: totalApps > 0 ? `${(parseInt(f.count) / totalApps) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-text-light tabular-nums w-6 text-right">{f.count}</span>
                </div>
              </div>
            ))}
            {funnel.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No applications yet</p>
            )}
          </div>
        </div>

        {/* Pool growth */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-text-light text-[15px] mb-4">
            Pool Growth <span className="text-text-muted font-normal text-xs">(12 weeks)</span>
          </h2>
          {weeklyGrowth.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No data yet</p>
          ) : (
            <div className="flex items-end gap-1 h-20">
              {weeklyGrowth.map((w, i) => {
                const pct = Math.max(4, (parseInt(w.count) / maxWeek) * 100);
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-primary/60 hover:bg-primary transition-colors cursor-default"
                    style={{ height: `${pct}%` }}
                    title={`Week ${i + 1}: ${w.count} new`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Email stats */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-text-light text-[15px] mb-4">Email Performance</h2>
          <div className="space-y-2">
            {emailStats.map((e) => (
              <div key={e.status} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-text-dim capitalize">{e.status}</span>
                <span className="text-sm font-semibold text-text-light tabular-nums">{e.count}</span>
              </div>
            ))}
            {emailStats.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No emails sent yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Top skills */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-text-light text-[15px] mb-4">Top Skills in Pool</h2>
        {topSkills.length === 0 ? (
          <p className="text-sm text-text-muted">No skills data yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topSkills.map((s) => {
              const relSize = parseInt(s.count) / maxSkillCount;
              const size = relSize > 0.7 ? "text-base" : relSize > 0.4 ? "text-sm" : "text-xs";
              return (
                <span
                  key={s.skill}
                  className={`badge badge-blue ${size}`}
                >
                  {s.skill}
                  <span className="text-blue-300/60 ml-1">{s.count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
