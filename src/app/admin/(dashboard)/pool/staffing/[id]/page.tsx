import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getInitials, availabilityBadgeClass, formatDate, formatRelativeTime, cn } from "@/lib/cn";
import Link from "next/link";
import StaffingCVViewer from "./StaffingCVViewer";
import type { Role, Education, Certification, SpokenLanguage, Project, Award, Publication, VolunteerWork } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await queryOne<{ full_name: string | null }>("SELECT full_name FROM staffing_resources WHERE id = $1", [id]);
  return { title: r?.full_name || "Resource" };
}

export default async function StaffingResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminSession();

  const resource = await queryOne<{
    id: string; full_name: string | null; email: string | null; phone: string | null;
    current_title: string | null; current_company: string | null; location: string | null;
    work_mode: string | null; availability_status: string; expected_rate: string | null;
    rate_currency: string | null; notice_period_days: number | null; notes: string | null;
    skills: string[] | null; total_experience_years: number | null;
    status: string; created_at: string; updated_at: string;
    company_name: string; company_id: string;
  }>(
    `SELECT sr.id, sr.full_name, sr.email, sr.phone, sr.current_title, sr.current_company,
            sr.location, sr.work_mode, sr.availability_status, sr.expected_rate, sr.rate_currency,
            sr.notice_period_days, sr.notes, sr.skills, sr.total_experience_years,
            sr.status, sr.created_at, sr.updated_at,
            sc.name AS company_name, sc.id AS company_id
     FROM staffing_resources sr
     JOIN staffing_companies sc ON sc.id = sr.company_id
     WHERE sr.id = $1 AND sr.status != 'deleted'`,
    [id]
  );
  if (!resource) notFound();

  const [profile, skills] = await Promise.all([
    queryOne<{
      id: string; raw_cv_url: string | null; raw_cv_filename: string | null;
      parsed_json: Record<string, unknown> | null; summary: string | null;
      parse_status: string; parse_error: string | null;
      total_experience_years: number | null;
    }>(
      `SELECT id, raw_cv_url, raw_cv_filename, parsed_json, summary, parse_status, parse_error, total_experience_years
       FROM staffing_resource_profiles WHERE resource_id = $1 AND is_current = TRUE`,
      [id]
    ),
    query<{ id: string; skill: string; skill_normalized: string; years: number | null; proficiency: string | null }>(
      "SELECT id, skill, skill_normalized, years, proficiency FROM staffing_resource_skills WHERE resource_id = $1 ORDER BY years DESC NULLS LAST",
      [id]
    ),
  ]);

  const displayName = resource.full_name || resource.email || "Unknown";
  const parsedCV = profile?.parsed_json as Record<string, unknown> | null;
  const roles: Role[] = (parsedCV?.roles as Role[]) || [];
  const education = (parsedCV?.education as Education[]) || [];
  const certifications = (parsedCV?.certifications as Certification[]) || [];
  const languages = (parsedCV?.languages as SpokenLanguage[]) || [];
  const projects: Project[] = (parsedCV?.projects as Project[]) || [];
  const awards: Award[] = (parsedCV?.awards as Award[]) || [];
  const publications: Publication[] = (parsedCV?.publications as Publication[]) || [];
  const volunteer: VolunteerWork[] = (parsedCV?.volunteer as VolunteerWork[]) || [];
  const hasCv = !!profile?.raw_cv_url;
  const parseAlert = profile?.parse_status === "failed" || profile?.parse_status === "review_required";
  const expYears = profile?.total_experience_years ?? resource.total_experience_years;
  const cvHeadline = parsedCV?.headline as string | undefined;
  const cvDomain = parsedCV?.domain as string | undefined;
  const cvSeniority = parsedCV?.seniority as string | undefined;
  const cvLinkedin = parsedCV?.linkedin as string | undefined;
  const cvGithub = parsedCV?.github as string | undefined;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-1.5 text-xs text-text-dim">
        <Link href="/admin/pool" className="hover:text-text-light transition-colors">Talent Pool</Link>
        <span className="text-text-dim/40">/</span>
        <Link href={`/admin/staffing/companies/${resource.company_id}`} className="hover:text-text-light transition-colors">{resource.company_name}</Link>
        <span className="text-text-dim/40">/</span>
        <span className="text-text-dim truncate">{displayName}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-400 font-bold text-lg flex items-center justify-center shrink-0">
            {getInitials(displayName)}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-light">{displayName}</h1>
            {cvHeadline && (
              <p className="text-text-dim text-sm mt-0.5">{cvHeadline}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={availabilityBadgeClass(resource.availability_status)}>{resource.availability_status}</span>
              <span className="badge badge-purple">{resource.company_name}</span>
              {expYears != null && <span className="text-xs text-text-dim">{expYears} yrs exp</span>}
            </div>
          </div>
        </div>
      </div>

      {parseAlert && (
        <div className={cn("flex items-start gap-3 px-4 py-3 rounded-xl border text-sm",
          profile?.parse_status === "failed" ? "bg-red-400/10 border-red-400/25 text-red-400" : "bg-amber-400/10 border-amber-400/25 text-amber-400"
        )}>
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">CV parse {profile?.parse_status === "failed" ? "failed" : "needs review"}</p>
            {profile?.parse_error && <p className="text-xs mt-0.5 opacity-80">{profile.parse_error}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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

          {roles.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
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
                            <p className="text-xs text-text-dim mt-0.5">{role.company}{role.location ? ` · ${role.location}` : ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {role.is_current && <span className="badge badge-green text-xs">Current</span>}
                            <p className="text-xs text-text-dim mt-1">
                              {role.start_date && <>{role.start_date}{role.end_date ? ` – ${role.end_date}` : " – Present"}</>}
                            </p>
                          </div>
                        </div>
                        {role.summary && <p className="text-xs text-text-dim mt-2 leading-relaxed">{role.summary}</p>}
                        {role.achievements && role.achievements.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {role.achievements.map((ach, ai) => (
                              <li key={ai} className="text-xs text-text-dim flex gap-2">
                                <span className="text-primary/60 shrink-0">▸</span><span>{ach}</span>
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

          {education.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>
                Education
              </h2>
              <div className="space-y-3">
                {education.map((edu, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-light">{edu.institution}</p>
                        {(edu.degree || edu.field) && <p className="text-xs text-text-dim mt-0.5">{[edu.degree, edu.field].filter(Boolean).join(", ")}</p>}
                      </div>
                      {edu.graduation_year && <span className="text-xs text-text-dim shrink-0">{edu.graduation_year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {certifications.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                Certifications
              </h2>
              <div className="flex flex-wrap gap-2">
                {certifications.map((cert, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-text-light">{cert.name}</p>
                    {(cert.issuer || cert.year) && <p className="text-xs text-text-dim mt-0.5">{[cert.issuer, cert.year].filter(Boolean).join(" · ")}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {projects.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
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
                        </div>
                        {proj.description && <p className="text-xs text-text-dim mt-1 leading-relaxed">{proj.description}</p>}
                      </div>
                    </div>
                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {proj.technologies.map((t, ti) => <span key={ti} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {awards.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                Awards
              </h2>
              <div className="space-y-2">
                {awards.map((a, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-light">{a.title}</p>
                        {a.issuer && <p className="text-xs text-text-dim mt-0.5">{a.issuer}</p>}
                      </div>
                      {a.year && <span className="text-xs text-text-dim shrink-0">{a.year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {volunteer.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                Volunteer Work
              </h2>
              <div className="space-y-2">
                {volunteer.map((v, i) => (
                  <div key={i} className="bg-bg-secondary border border-border rounded-xl p-4">
                    <p className="text-sm font-semibold text-text-light">{v.role}</p>
                    <p className="text-xs text-text-dim mt-0.5">{v.organization}</p>
                    {v.description && <p className="text-xs text-text-dim mt-1">{v.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {resource.notes && (
            <section>
              <h2 className="text-sm font-semibold text-text-light mb-3">Notes from Vendor</h2>
              <div className="bg-bg-secondary border border-border rounded-xl p-4">
                <p className="text-sm text-text-dim leading-relaxed whitespace-pre-wrap">{resource.notes}</p>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">Contact</h3>
            {resource.email && (
              <div>
                <p className="text-xs text-text-dim">Email</p>
                <a href={`mailto:${resource.email}`} className="text-sm text-primary hover:underline break-all">{resource.email}</a>
              </div>
            )}
            {resource.phone && (
              <div>
                <p className="text-xs text-text-dim">Phone</p>
                <a href={`tel:${resource.phone}`} className="text-sm text-text-light hover:text-primary transition-colors">{resource.phone}</a>
              </div>
            )}
            {cvLinkedin && (
              <div>
                <p className="text-xs text-text-dim">LinkedIn</p>
                <a href={cvLinkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                  {cvLinkedin.replace("https://www.linkedin.com/in/", "in/")}
                </a>
              </div>
            )}
            {cvGithub && (
              <div>
                <p className="text-xs text-text-dim">GitHub</p>
                <a href={cvGithub} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                  {cvGithub.replace("https://github.com/", "github/")}
                </a>
              </div>
            )}
          </section>

          <section className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">Details</h3>
            {resource.location && <div><p className="text-xs text-text-dim">Location</p><p className="text-sm text-text-light">{resource.location}</p></div>}
            {cvDomain && <div><p className="text-xs text-text-dim">Domain</p><p className="text-sm text-text-light">{cvDomain}</p></div>}
            {cvSeniority && <div><p className="text-xs text-text-dim">Seniority</p><p className="text-sm text-text-light capitalize">{cvSeniority}</p></div>}
            {resource.work_mode && <div><p className="text-xs text-text-dim">Work mode</p><p className="text-sm text-text-light capitalize">{resource.work_mode}</p></div>}
            {resource.notice_period_days != null && (
              <div><p className="text-xs text-text-dim">Notice period</p><p className="text-sm text-text-light">{resource.notice_period_days === 0 ? "Immediate" : `${resource.notice_period_days} days`}</p></div>
            )}
            <div><p className="text-xs text-text-dim">Added</p><p className="text-sm text-text-light">{formatDate(resource.created_at)}</p></div>
            <div><p className="text-xs text-text-dim">Vendor</p>
              <Link href={`/admin/staffing/companies/${resource.company_id}`} className="text-sm text-primary hover:underline">{resource.company_name}</Link>
            </div>
          </section>

          {resource.expected_rate && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide">Compensation</h3>
              <div>
                <p className="text-xs text-text-dim">Expected rate</p>
                <p className="text-sm text-text-light font-medium">{resource.expected_rate} <span className="text-text-dim font-normal">{resource.rate_currency || ""}</span></p>
              </div>
            </section>
          )}

          {hasCv && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">CV</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-bg-hover flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-light truncate">{profile?.raw_cv_filename || "CV document"}</p>
                  <p className="text-xs text-text-dim capitalize">{profile?.parse_status?.replace(/_/g, " ")}</p>
                </div>
              </div>
              <StaffingCVViewer
                resourceId={resource.id}
                filename={profile?.raw_cv_filename ?? undefined}
                parseStatus={profile?.parse_status}
                parseError={profile?.parse_error ?? undefined}
              />
            </section>
          )}

          {skills.length > 0 && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span key={s.id} title={s.years ? `${s.years} yr${s.years !== 1 ? "s" : ""}` : undefined}
                    className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border",
                      s.proficiency === "expert" ? "bg-primary/10 border-primary/20 text-primary" :
                      s.proficiency === "advanced" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                      "bg-bg-hover border-border text-text-light"
                    )}
                  >
                    {s.skill}{s.years ? <span className="text-text-dim">{s.years}y</span> : null}
                  </span>
                ))}
              </div>
            </section>
          )}

          {languages.length > 0 && (
            <section className="bg-bg-secondary border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">Languages</h3>
              <div className="space-y-1.5">
                {languages.map((lang, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-sm text-text-light">{lang.language}</p>
                    {lang.proficiency && <span className="text-xs text-text-dim capitalize">{lang.proficiency}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
