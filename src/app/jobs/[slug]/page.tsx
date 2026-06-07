import { Metadata } from "next";
import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getCandidateSession } from "@/lib/auth";
import type { Requirement, RequirementQuestion } from "@/types";
import OTPAuthCard from "./OTPAuthCard";
import ApplicationFlow from "./ApplicationFlow";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const req = await queryOne<Requirement>(
    "SELECT title FROM requirements WHERE public_slug = $1 AND status = 'open'",
    [slug]
  );
  if (!req) return { title: "Position Not Available — Nano" };
  return {
    title: `${req.title} — Nano`,
    description: `Apply for ${req.title} at Sajal Tech`,
  };
}

function engagementLabel(type: Requirement["engagement_type"]): string {
  const map: Record<string, string> = {
    contract: "Contract",
    fulltime: "Full-time",
    both: "Contract / Full-time",
  };
  return map[type] ?? type;
}

function workModeLabel(mode?: string): string {
  if (!mode) return "";
  const map: Record<string, string> = {
    remote: "Remote",
    onsite: "On-site",
    hybrid: "Hybrid",
    flexible: "Flexible",
  };
  return map[mode] ?? mode;
}

function NanoHeader({ showBack = false }: { showBack?: boolean }) {
  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{
        background: "color-mix(in srgb, var(--color-bg) 85%, transparent)",
        borderColor: "var(--color-border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--color-primary)" }}
          >
            <span
              className="font-display font-bold text-white"
              style={{ fontSize: "13px", letterSpacing: "-0.02em" }}
            >
              N
            </span>
          </div>
          <span
            className="font-display font-semibold"
            style={{
              fontSize: "14px",
              color: "var(--color-text-light)",
              letterSpacing: "-0.02em",
            }}
          >
            Nano
          </span>
          <span
            style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
            className="hidden sm:inline"
          >
            by Sajal Tech
          </span>
        </div>

        {showBack && (
          <Link
            href="/jobs"
            className="flex items-center gap-1 transition-colors"
            style={{ fontSize: "13px", color: "var(--color-text-dim)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            All positions
          </Link>
        )}
      </div>
    </header>
  );
}

export default async function JobDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const [req, session] = await Promise.all([
    queryOne<Requirement>(
      "SELECT * FROM requirements WHERE public_slug = $1 AND status = 'open'",
      [slug]
    ),
    getCandidateSession(),
  ]);

  if (!req) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--color-bg)" }}
      >
        <NanoHeader />

        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="text-center max-w-xs animate-fade-up">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{
                background: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--color-text-dim)" }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1
              className="font-display font-bold mb-2"
              style={{
                fontSize: "20px",
                color: "var(--color-text-light)",
                letterSpacing: "-0.02em",
              }}
            >
              Position Closed
            </h1>
            <p
              className="mb-6"
              style={{ fontSize: "14px", color: "var(--color-text-dim)", lineHeight: 1.6 }}
            >
              This role has been filled or is no longer accepting applications.
            </p>

            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 btn btn-secondary"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Browse open positions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const questions = await query<RequirementQuestion>(
    "SELECT * FROM requirement_questions WHERE requirement_id = $1 ORDER BY sort_order ASC",
    [req.id]
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)" }}
    >
      <NanoHeader showBack />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Job header */}
        <div className="mb-8 stagger">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span
              className="badge"
              style={{
                background: "var(--primary-subtle)",
                color: "var(--color-primary)",
                border: "1px solid rgba(var(--color-primary-rgb), 0.2)",
              }}
            >
              {engagementLabel(req.engagement_type)}
            </span>

            {req.work_mode && (
              <span className="badge badge-gray">
                {workModeLabel(req.work_mode)}
              </span>
            )}

            {req.location && (
              <span
                className="inline-flex items-center gap-1"
                style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {req.location}
              </span>
            )}
          </div>

          <h1
            className="font-display font-bold"
            style={{
              fontSize: "clamp(22px, 4vw, 30px)",
              color: "var(--color-text-light)",
              letterSpacing: "-0.025em",
              lineHeight: 1.2,
            }}
          >
            {req.title}
          </h1>
        </div>

        {/* Auth gate or flow */}
        <div className="flex flex-col items-center sm:items-start">
          {!session ? (
            <div className="w-full max-w-[540px] space-y-4 animate-fade-up">
              <div>
                <p
                  className="font-display font-semibold mb-0.5"
                  style={{ fontSize: "14px", color: "var(--color-text-dim)" }}
                >
                  Applying for
                </p>
                <p
                  className="font-display font-bold"
                  style={{
                    fontSize: "18px",
                    color: "var(--color-text-light)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {req.title}
                </p>
              </div>

              <OTPAuthCard />
            </div>
          ) : (
            <div className="w-full animate-fade-up">
              <ApplicationFlow
                requirement={req}
                questions={questions}
                session={session}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
