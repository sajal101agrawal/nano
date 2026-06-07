import Link from "next/link";
import { Zap, Bot, FileText, Bell } from "lucide-react";

const features = [
  { icon: Zap, label: "Semantic Search", sub: "Vector + keyword" },
  { icon: Bot, label: "AI Matching", sub: "Claude-ranked shortlists" },
  { icon: FileText, label: "CV Parsing", sub: "Structured extraction" },
  { icon: Bell, label: "Availability", sub: "One-click confirmation" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-[0.06] blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }}
        />

        {/* Logo */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-6 shadow-lg shadow-primary/25 animate-float">
          <span className="font-display font-black text-3xl text-white leading-none">N</span>
        </div>

        <h1 className="font-display text-5xl sm:text-6xl font-bold text-text-light tracking-tight mb-3">
          Nano
        </h1>
        <p className="text-text-dim text-lg mb-2">
          Talent Platform by Sajal Tech
        </p>
        <p className="text-text-muted text-sm max-w-md mb-10 leading-relaxed">
          Staff augmentation infrastructure — AI-powered candidate matching, CV parsing, and availability tracking for live client requirements.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin"
            className="btn btn-primary"
            style={{ padding: "10px 24px", fontSize: "15px" }}
          >
            Admin Dashboard
          </Link>
          <Link
            href="/jobs"
            className="btn btn-secondary"
            style={{ padding: "10px 24px", fontSize: "15px" }}
          >
            View Open Roles
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-16 max-w-2xl w-full">
          {features.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="card p-4 text-left">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-text-light mb-0.5">{label}</p>
              <p className="text-xs text-text-muted leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-5 px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-xs text-text-muted">Nano by Sajal Tech</span>
          <a
            href="https://sajaltech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted hover:text-primary transition-colors"
          >
            sajaltech.com
          </a>
        </div>
      </footer>
    </div>
  );
}
