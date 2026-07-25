import { requireAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import Link from "next/link";
import { formatDate, formatRelativeTime, cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interviews — Nano" };

type InterviewRow = {
  id: string;
  candidate_id: string;
  requirement_id: string;
  candidate_name: string;
  requirement_title: string;
  interview_type: string;
  round_number: number;
  scheduled_at: string | null;
  duration_minutes: number;
  location: string | null;
  status: string;
  interviewer_names: string;
};

const TYPE_LABELS: Record<string, string> = {
  video: "Video", phone: "Phone", technical: "Technical", onsite: "On-site", hr: "HR",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "badge badge-blue",
  completed: "badge badge-green",
  cancelled: "badge badge-gray",
  no_show: "badge badge-red",
};

export default async function InterviewsPage() {
  await requireAdminSession();

  const rows = await query<InterviewRow>(
    `SELECT i.*,
            c.full_name AS candidate_name,
            r.title AS requirement_title,
            COALESCE(string_agg(u.name, ', ' ORDER BY ii.created_at), '') AS interviewer_names
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     JOIN requirements r ON r.id = i.requirement_id
     LEFT JOIN interview_interviewers ii ON ii.interview_id = i.id
     LEFT JOIN users u ON u.id = ii.user_id
     GROUP BY i.id, c.full_name, r.title
     ORDER BY i.scheduled_at ASC NULLS LAST, i.created_at DESC
     LIMIT 100`
  );

  const upcoming = rows.filter((r) => r.status === "scheduled" && r.scheduled_at && new Date(r.scheduled_at) >= new Date());
  const past = rows.filter((r) => !upcoming.includes(r));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Interviews</h1>
          <p className="section-subtitle">{upcoming.length} upcoming · {past.length} past</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-text-dim text-sm">No interviews scheduled yet.</p>
          <p className="text-text-dim/60 text-xs mt-1">Schedule interviews from any candidate&apos;s application.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide mb-3">Upcoming</h2>
              <InterviewTable rows={upcoming} />
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide mb-3">Past</h2>
              <InterviewTable rows={past} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function InterviewTable({ rows }: { rows: InterviewRow[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-5 py-3 text-xs font-medium text-text-dim">Candidate</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-text-dim hidden md:table-cell">Job</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-text-dim">Type</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-text-dim hidden sm:table-cell">When</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-text-dim hidden lg:table-cell">Interviewers</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-text-dim">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-bg-hover transition-colors">
              <td className="px-5 py-3.5">
                <Link href={`/admin/candidates/${row.candidate_id}`} className="text-sm font-medium text-text-light hover:text-primary transition-colors">
                  {row.candidate_name}
                </Link>
              </td>
              <td className="px-4 py-3.5 hidden md:table-cell">
                <Link href={`/admin/requirements/${row.requirement_id}`} className="text-xs text-text-dim hover:text-primary transition-colors truncate max-w-[200px] block">
                  {row.requirement_title}
                </Link>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-xs text-text-dim">
                  {TYPE_LABELS[row.interview_type] || row.interview_type} · R{row.round_number}
                </span>
              </td>
              <td className="px-4 py-3.5 hidden sm:table-cell">
                {row.scheduled_at ? (
                  <div>
                    <p className="text-sm text-text-light">{formatDate(row.scheduled_at)}</p>
                    <p className="text-xs text-text-dim">{formatRelativeTime(row.scheduled_at)} · {row.duration_minutes}min</p>
                  </div>
                ) : (
                  <span className="text-xs text-text-dim/50">TBD</span>
                )}
              </td>
              <td className="px-4 py-3.5 hidden lg:table-cell">
                <span className="text-xs text-text-dim">{row.interviewer_names || "—"}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className={STATUS_COLORS[row.status] || "badge badge-gray"}>
                  {row.status.replace(/_/g, " ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
