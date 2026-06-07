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
import DeleteButton from "@/components/admin/DeleteButton";
import type {
  Candidate,
  CandidateProfile,
  CandidateSkill,
  Application,
  AvailabilityEvent,
  OutreachMessage,
  Role,
  Education,
  Certification,
  SpokenLanguage,
  Project,
  Award,
  Publication,
  VolunteerWork,
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
  const education = parsedCV?.education || [];
  const certifications = parsedCV?.certifications || [];
  const languages = parsedCV?.languages || [];
  const projects: Project[] = parsedCV?.projects || [];
  const awards: Award[] = parsedCV?.awards || [];
  const publications: Publication[] = parsedCV?.publications || [];
  const volunteer: VolunteerWork[] = parsedCV?.volunteer || [];
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

        <div className="flex items-center gap-2">
          <CandidateActions
            candidateId={candidate.id}
            candidateName={displayName}
            candidateEmail={candidate.primary_email || ""}
          />
          <DeleteButton
            endpoint={`/api/admin/candidates/${candidate.id}`}
            entityLabel={displayName}
            confirmMessage={`Permanently delete ${displayName}? All their CV data, skills, and applications will be removed.`}
            redirectTo="/admin/candidates"
            iconSize="md"
            className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/8 border border-border transition-colors"
          />
        </div>
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
                            <p className="text-xs text-text-dim mt-0.5">
                              {role.company}
                              {role.location ? ` · ${role.location}` : ""}
                            </p>
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
                            {role.duration_months && (
                              <p className="text-xs text-text-dim/60 mt-0.5">
                                {role.duration_months >= 12
                                  ? `${Math.floor(role.duration_months / 12)}y ${role.duration_months % 12 > 0 ? `${role.duration_months % 12}m` : ""}`
                                  : `${role.duration_months}m`}
                              </p>
                            )}
                          </div>
                        </div>
                        {role.summary && (
                          <p className="text-xs text-text-dim mt-2 leading-relaxed">{role.summary}</p>
                        )}
                        {role.achievements && role.achievements.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {role.achievements.map((ach, ai) => (
                              <li key={ai} className="text-xs text-text-dim flex gap-2">
                                <span className="text-primary/60 shrink-0">▸</span>
                                <span>{ach}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Education */}
          {education.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
                Education
              </h2>
              <div className="space-y-3">
                {(education as Education[]).map((edu, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-light">{edu.institution}</p>
                        {(edu.degree || edu.field) && (
                          <p className="text-xs text-text-dim mt-0.5">
                            {[edu.degree, edu.field].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {edu.grade && <p className="text-xs text-text-dim/60 mt-0.5">Grade: {edu.grade}</p>}
                      </div>
                      {edu.graduation_year && (
                        <span className="text-xs text-text-dim shrink-0">{edu.graduation_year}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Certifications
              </h2>
              <div className="flex flex-wrap gap-2">
                {(certifications as Certification[]).map((cert, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-text-light">{cert.name}</p>
                    {(cert.issuer || cert.year) && (
                      <p className="text-xs text-text-dim mt-0.5">
                        {[cert.issuer, cert.year].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Projects
              </h2>
              <div className="space-y-3">
                {projects.map((proj, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-text-light">{proj.name}</p>
                          {proj.is_open_source && <span className="badge badge-green text-xs">Open Source</span>}
                          {proj.url && (
                            <a href={proj.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[160px]">
                              {proj.url.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </div>
                        {proj.description && <p className="text-xs text-text-dim mt-1 leading-relaxed">{proj.description}</p>}
                      </div>
                      {(proj.start_date || proj.end_date) && (
                        <span className="text-xs text-text-dim shrink-0">
                          {proj.start_date}{proj.end_date ? ` – ${proj.end_date}` : proj.start_date ? " – Present" : ""}
                        </span>
                      )}
                    </div>
                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {proj.technologies.map((t, ti) => (
                          <span key={ti} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{t}</span>
                        ))}
                      </div>
                    )}
                    {proj.highlights && proj.highlights.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {proj.highlights.map((h, hi) => (
                          <li key={hi} className="text-xs text-text-dim flex gap-2">
                            <span className="text-primary/60 shrink-0">▸</span><span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Awards */}
          {awards.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Awards & Honors
              </h2>
              <div className="space-y-2">
                {awards.map((a, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-light">{a.title}</p>
                        {a.issuer && <p className="text-xs text-text-dim mt-0.5">{a.issuer}</p>}
                        {a.description && <p className="text-xs text-text-dim mt-1">{a.description}</p>}
                      </div>
                      {a.year && <span className="text-xs text-text-dim shrink-0">{a.year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Publications */}
          {publications.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Publications
              </h2>
              <div className="space-y-2">
                {publications.map((pub, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-light">
                          {pub.url ? <a href={pub.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">{pub.title}</a> : pub.title}
                        </p>
                        {pub.publisher && <p className="text-xs text-text-dim mt-0.5">{pub.publisher}</p>}
                        {pub.description && <p className="text-xs text-text-dim mt-1">{pub.description}</p>}
                      </div>
                      {pub.year && <span className="text-xs text-text-dim shrink-0">{pub.year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Volunteer */}
          {volunteer.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Volunteer Work
              </h2>
              <div className="space-y-2">
                {volunteer.map((v, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-light">{v.role}</p>
                        <p className="text-xs text-text-dim mt-0.5">{v.organization}</p>
                        {v.description && <p className="text-xs text-text-dim mt-1">{v.description}</p>}
                      </div>
                      {(v.start_date || v.end_date) && (
                        <span className="text-xs text-text-dim shrink-0">
                          {v.start_date}{v.end_date ? ` – ${v.end_date}` : v.start_date ? " – Present" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
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
                      <th className="w-10 px-2 py-3" />
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
                        <td className="px-2 py-3">
                          <DeleteButton
                            endpoint={`/api/admin/applications/${app.id}`}
                            entityLabel="application"
                            confirmMessage={`Delete this application for "${app.requirement_title}"? This cannot be undone.`}
                          />
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
            <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">Contact</h3>
            {candidate.primary_email && (
              <div>
                <p className="text-xs text-text-dim">Email</p>
                <a href={`mailto:${candidate.primary_email}`} className="text-sm text-primary hover:underline break-all">
                  {candidate.primary_email}
                </a>
              </div>
            )}
            {candidate.primary_phone && (
              <div>
                <p className="text-xs text-text-dim">Phone</p>
                <a href={`tel:${candidate.primary_phone}`} className="text-sm text-text-light hover:text-primary transition-colors">
                  {candidate.primary_phone}
                </a>
              </div>
            )}
            {parsedCV?.linkedin && (
              <div>
                <p className="text-xs text-text-dim">LinkedIn</p>
                <a href={parsedCV.linkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                  {parsedCV.linkedin.replace("https://www.linkedin.com/in/", "in/")}
                </a>
              </div>
            )}
            {parsedCV?.github && (
              <div>
                <p className="text-xs text-text-dim">GitHub</p>
                <a href={parsedCV.github} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                  {parsedCV.github.replace("https://github.com/", "github/")}
                </a>
              </div>
            )}
            {parsedCV?.portfolio && (
              <div>
                <p className="text-xs text-text-dim">Portfolio</p>
                <a href={parsedCV.portfolio} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all truncate block">
                  {parsedCV.portfolio}
                </a>
              </div>
            )}
          </section>

          {/* Professional Details */}
          <section className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">Details</h3>
            {candidate.location && (
              <div>
                <p className="text-xs text-text-dim">Location</p>
                <p className="text-sm text-text-light">{candidate.location}</p>
              </div>
            )}
            {parsedCV?.domain && (
              <div>
                <p className="text-xs text-text-dim">Domain</p>
                <p className="text-sm text-text-light">{parsedCV.domain}</p>
              </div>
            )}
            {parsedCV?.seniority && (
              <div>
                <p className="text-xs text-text-dim">Seniority</p>
                <p className="text-sm text-text-light capitalize">{parsedCV.seniority}</p>
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
                  {candidate.notice_period_days === 0 ? "Immediate" : `${candidate.notice_period_days} days`}
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
                <p className="text-sm text-text-light">{formatRelativeTime(candidate.last_active_at)}</p>
              </div>
            )}
          </section>

          {/* Compensation */}
          {(candidate.expected_rate || profile?.expected_rate) && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">Compensation</h3>
              {(candidate.expected_rate || profile?.expected_rate) && (
                <div>
                  <p className="text-xs text-text-dim">Expected rate / CTC</p>
                  <p className="text-sm text-text-light font-medium">
                    {candidate.expected_rate || profile?.expected_rate}
                    {" "}
                    <span className="text-text-dim font-normal">
                      {candidate.expected_rate_currency || profile?.currency || ""}
                    </span>
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                {candidate.open_to_contract != null && (
                  <div>
                    <p className="text-xs text-text-dim">Contract</p>
                    <p className={cn("text-xs font-medium mt-0.5", candidate.open_to_contract ? "text-emerald-400" : "text-text-dim/50")}>
                      {candidate.open_to_contract ? "Open" : "No"}
                    </p>
                  </div>
                )}
                {candidate.open_to_fulltime != null && (
                  <div>
                    <p className="text-xs text-text-dim">Full-time</p>
                    <p className={cn("text-xs font-medium mt-0.5", candidate.open_to_fulltime ? "text-emerald-400" : "text-text-dim/50")}>
                      {candidate.open_to_fulltime ? "Open" : "No"}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* CV */}
          {hasCv && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">CV</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-bg-hover flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-light truncate">{profile?.raw_cv_filename || "CV document"}</p>
                  <p className="text-xs text-text-dim capitalize">{profile?.parse_status?.replace(/_/g, " ")}</p>
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
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span
                    key={s.id}
                    title={s.years ? `${s.years} yr${s.years !== 1 ? "s" : ""}` : undefined}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border",
                      s.proficiency === "expert" ? "bg-primary/10 border-primary/20 text-primary" :
                      s.proficiency === "advanced" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                      "bg-bg-hover border-border text-text-light"
                    )}
                  >
                    {s.skill}
                    {s.years ? <span className="text-text-dim">{s.years}y</span> : null}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Languages */}
          {languages.length > 0 && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">Languages</h3>
              <div className="space-y-1.5">
                {(languages as SpokenLanguage[]).map((lang, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-sm text-text-light">{lang.language}</p>
                    {lang.proficiency && (
                      <span className="text-xs text-text-dim capitalize">{lang.proficiency}</span>
                    )}
                  </div>
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
                      <div className={cn(
                        "absolute -left-4 top-1.5 w-2 h-2 rounded-full border-2 border-bg-secondary",
                        ev.status === "available" ? "bg-emerald-500" :
                        ev.status === "unavailable" ? "bg-red-500" : "bg-amber-500"
                      )} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-medium",
                            ev.status === "available" ? "text-emerald-400" :
                            ev.status === "unavailable" ? "text-red-400" : "text-amber-400"
                          )}>
                            {ev.status}
                          </span>
                          <span className="text-xs text-text-dim capitalize">via {ev.source.replace(/_/g, " ")}</span>
                        </div>
                        <p className="text-xs text-text-dim mt-0.5">{formatRelativeTime(ev.responded_at || ev.requested_at)}</p>
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
