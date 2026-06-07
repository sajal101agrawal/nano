import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import {
  getInitials,
  availabilityBadgeClass,
  applicationStatusBadgeClass,
  formatDate,
  formatRelativeTime,
  cn,
} from "@/lib/cn";
import Link from "next/link";
import CandidateActions from "./CandidateActions";
import CVViewer from "./CVViewer";
import type {
  Candidate,
  CandidateProfile,
  CandidateSkill,
  Application,
  AvailabilityEvent,
  OutreachMessage,
  Role,
  MessageStatus,
} from "@/types";

type ApplicationWithReq = Application & {
  requirement_title: string;
  client_name: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await queryOne<{ full_name: string | null; primary_email: string | null }>(
    "SELECT full_name, primary_email FROM candidates WHERE id = $1",
    [id]
  );
  const name = c?.full_name || c?.primary_email || "Candidate";
  return { title: name };
}

function sourceBadgeClass(source: string): string {
  const map: Record<string, string> = {
    application: "badge badge-blue",
    linkedin: "badge badge-purple",
    referral: "badge badge-green",
    admin: "badge badge-gray",
    import: "badge badge-amber",
  };
  return map[source] || "badge badge-gray";
}

function messageStatusBadgeClass(status: MessageStatus): string {
  const map: Record<MessageStatus, string> = {
    queued: "badge badge-gray",
    sent: "badge badge-blue",
    delivered: "badge badge-blue",
    opened: "badge badge-green",
    clicked: "badge badge-green",
    bounced: "badge badge-red",
    failed: "badge badge-red",
    replied: "badge badge-purple",
  };
  return map[status] || "badge badge-gray";
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminSession();

  const candidate = await queryOne<Candidate>(
    `SELECT * FROM candidates WHERE id = $1 AND status != 'deleted'`,
    [id]
  );
  if (!candidate) notFound();

  const [profile, skills, applications, availabilityEvents, outreachMessages] =
    await Promise.all([
      queryOne<CandidateProfile>(
        `SELECT * FROM candidate_profiles WHERE candidate_id = $1 AND is_current = TRUE`,
        [id]
      ),
      query<CandidateSkill>(
        `SELECT * FROM candidate_skills WHERE candidate_id = $1 ORDER BY years DESC NULLS LAST`,
        [id]
      ),
      query<ApplicationWithReq>(
        `SELECT a.*,
                r.title AS requirement_title,
                c.company_name AS client_name
         FROM applications a
         JOIN requirements r ON r.id = a.requirement_id
         LEFT JOIN clients c ON c.id = r.client_id
         WHERE a.candidate_id = $1
         ORDER BY a.applied_at DESC`,
        [id]
      ),
      query<AvailabilityEvent>(
        `SELECT * FROM availability_events
         WHERE candidate_id = $1
         ORDER BY requested_at DESC
         LIMIT 10`,
        [id]
      ),
      query<OutreachMessage>(
        `SELECT * FROM outreach_messages
         WHERE target_type = 'candidate' AND target_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [id]
      ),
    ]);

  const displayName =
    candidate.full_name || candidate.primary_email || "Unknown";
  const parsedCV = profile?.parsed_json;
  const roles: Role[] = parsedCV?.roles || [];
  const hasCv = !!profile?.raw_cv_url;
  const parseAlert =
    profile?.parse_status === "failed" ||
    profile?.parse_status === "review_required";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-text-dim">
        <Link href="/admin/candidates" className="hover:text-text-light transition-colors">
          Candidates
        </Link>
        <span className="text-text-dim/40">/</span>
        <span className="text-text-dim truncate">{displayName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary font-bold text-lg flex items-center justify-center shrink-0">
            {getInitials(displayName)}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-light">
              {displayName}
            </h1>
            {candidate.headline && (
              <p className="text-text-dim text-sm mt-0.5">{candidate.headline}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={availabilityBadgeClass(candidate.availability_status)}>
                {candidate.availability_status}
              </span>
              <span className={sourceBadgeClass(candidate.source)}>
                {candidate.source}
              </span>
              {candidate.open_to_contract && (
                <span className="badge badge-amber">contract</span>
              )}
              {candidate.total_experience_years != null && (
                <span className="text-xs text-text-dim">
                  {candidate.total_experience_years} yrs exp
                </span>
              )}
            </div>
          </div>
        </div>

        <CandidateActions
          candidateId={candidate.id}
          candidateName={displayName}
          candidateEmail={candidate.primary_email || ""}
        />
      </div>

      {/* Parse alert */}
      {parseAlert && (
        <div
          className={cn(
            "flex items-start gap-3 px-4 py-3 rounded-xl border text-sm",
            profile?.parse_status === "failed"
              ? "bg-red-400/10 border-red-400/25 text-red-400"
              : "bg-amber-400/10 border-amber-400/25 text-amber-400"
          )}
        >
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">
              CV parse {profile?.parse_status === "failed" ? "failed" : "needs review"}
            </p>
            {profile?.parse_error && (
              <p className="text-xs mt-0.5 opacity-80">{profile.parse_error}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Summary */}
          {profile?.summary && (
            <section className="bg-primary/5 border border-primary/15 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a7.5 7.5 0 01-2.121 2.121L12 21l-2.675-2.675a7.5 7.5 0 01-2.121-2.121l-.347-.347z" />
                </svg>
                <h2 className="text-sm font-semibold text-primary">AI Summary</h2>
              </div>
              <p className="text-sm text-text-light leading-relaxed">{profile.summary}</p>
            </section>
          )}

          {/* Work Experience */}
          {roles.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Work Experience
              </h2>
              <div className="relative pl-4">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-5">
                  {roles.map((role, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-4 top-1.5 w-2 h-2 rounded-full bg-border border-2 border-bg-secondary" />
                      <div className="bg-bg-secondary border border-border rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-text-light">{role.title}</p>
                            <p className="text-xs text-text-dim mt-0.5">{role.company}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {role.is_current && (
                              <span className="badge badge-green text-xs">Current</span>
                            )}
                            <p className="text-xs text-text-dim mt-1">
                              {role.start_date && (
                                <>
                                  {role.start_date}
                                  {role.end_date ? ` – ${role.end_date}` : " – Present"}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        {role.summary && (
                          <p className="text-xs text-text-dim mt-2 leading-relaxed">
                            {role.summary}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Applications */}
          <section>
            <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Applications
              {applications.length > 0 && (
                <span className="ml-auto text-xs text-text-dim font-normal">
                  {applications.length}
                </span>
              )}
            </h2>
            {applications.length === 0 ? (
              <div className="bg-bg-secondary border border-border rounded-xl px-5 py-8 text-center text-text-dim text-sm">
                No applications yet.
              </div>
            ) : (
              <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-text-dim">Requirement</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-text-dim">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-text-dim hidden sm:table-cell">Score</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-text-dim hidden md:table-cell">Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {applications.map((app) => (
                      <tr key={app.id} className="hover:bg-bg-hover transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/requirements/${app.requirement_id}`}
                            className="text-sm text-text-light hover:text-primary transition-colors"
                          >
                            {app.requirement_title}
                          </Link>
                          {app.client_name && (
                            <p className="text-xs text-text-dim mt-0.5">{app.client_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={applicationStatusBadgeClass(app.status)}>
                            {app.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="text-sm text-text-dim">
                            {app.match_score != null
                              ? `${Math.round(app.match_score * 100)}%`
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className="text-xs text-text-dim">
                            {formatDate(app.applied_at)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Outreach messages */}
          {outreachMessages.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Outreach Messages
                <span className="ml-auto text-xs text-text-dim font-normal">
                  {outreachMessages.length}
                </span>
              </h2>
              <div className="bg-bg-secondary border border-border rounded-xl divide-y divide-border overflow-hidden">
                {outreachMessages.map((msg) => (
                  <div key={msg.id} className="px-4 py-3.5 hover:bg-bg-hover transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-text-light truncate font-medium">
                          {msg.subject}
                        </p>
                        <p className="text-xs text-text-dim mt-0.5 capitalize">
                          {msg.stream} · {msg.email_to}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={messageStatusBadgeClass(msg.status)}>
                          {msg.status}
                        </span>
                        <span className="text-xs text-text-dim">
                          {formatRelativeTime(msg.sent_at || msg.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Contact & Meta */}
          <section className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">
              Details
            </h3>
            {candidate.primary_email && (
              <div>
                <p className="text-xs text-text-dim">Email</p>
                <a
                  href={`mailto:${candidate.primary_email}`}
                  className="text-sm text-primary hover:underline break-all"
                >
                  {candidate.primary_email}
                </a>
              </div>
            )}
            {candidate.primary_phone && (
              <div>
                <p className="text-xs text-text-dim">Phone</p>
                <p className="text-sm text-text-light">{candidate.primary_phone}</p>
              </div>
            )}
            {candidate.location && (
              <div>
                <p className="text-xs text-text-dim">Location</p>
                <p className="text-sm text-text-light">{candidate.location}</p>
              </div>
            )}
            {candidate.work_mode && (
              <div>
                <p className="text-xs text-text-dim">Work mode</p>
                <p className="text-sm text-text-light capitalize">{candidate.work_mode}</p>
              </div>
            )}
            {candidate.notice_period_days != null && (
              <div>
                <p className="text-xs text-text-dim">Notice period</p>
                <p className="text-sm text-text-light">
                  {candidate.notice_period_days} day{candidate.notice_period_days !== 1 ? "s" : ""}
                </p>
              </div>
            )}
            {candidate.expected_rate && (
              <div>
                <p className="text-xs text-text-dim">Expected rate</p>
                <p className="text-sm text-text-light">
                  {candidate.expected_rate}
                  {candidate.expected_rate_currency
                    ? ` ${candidate.expected_rate_currency}`
                    : ""}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-text-dim">Added</p>
              <p className="text-sm text-text-light">{formatDate(candidate.created_at)}</p>
            </div>
            {candidate.last_active_at && (
              <div>
                <p className="text-xs text-text-dim">Last active</p>
                <p className="text-sm text-text-light">
                  {formatRelativeTime(candidate.last_active_at)}
                </p>
              </div>
            )}
          </section>

          {/* CV */}
          {hasCv && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                CV
              </h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-bg-hover flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-light truncate">
                    {profile?.raw_cv_filename || "CV document"}
                  </p>
                  <p className="text-xs text-text-dim capitalize">
                    {profile?.parse_status?.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              <CVViewer
                candidateId={candidate.id}
                filename={profile?.raw_cv_filename}
                parseStatus={profile?.parse_status}
                parseError={profile?.parse_error}
              />
            </section>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                Skills
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span
                    key={s.id}
                    title={
                      s.years
                        ? `${s.years} yr${s.years !== 1 ? "s" : ""}`
                        : undefined
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-hover text-text-light text-xs border border-border"
                  >
                    {s.skill}
                    {s.years ? (
                      <span className="text-text-dim">{s.years}y</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Availability history */}
          {availabilityEvents.length > 0 && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                Availability History
              </h3>
              <div className="relative pl-4">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                <div className="space-y-3">
                  {availabilityEvents.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div
                        className={cn(
                          "absolute -left-4 top-1.5 w-2 h-2 rounded-full border-2 border-bg-secondary",
                          ev.status === "available"
                            ? "bg-emerald-500"
                            : ev.status === "unavailable"
                              ? "bg-red-500"
                              : "bg-amber-500"
                        )}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              ev.status === "available"
                                ? "text-emerald-400"
                                : ev.status === "unavailable"
                                  ? "text-red-400"
                                  : "text-amber-400"
                            )}
                          >
                            {ev.status}
                          </span>
                          <span className="text-xs text-text-dim capitalize">
                            via {ev.source.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-xs text-text-dim mt-0.5">
                          {formatRelativeTime(ev.responded_at || ev.requested_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
