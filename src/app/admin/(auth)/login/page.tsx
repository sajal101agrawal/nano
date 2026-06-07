import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Zap, FileText, Bell, Target } from "lucide-react";

const features = [
  { Icon: Zap,      label: "AI-powered matching",  sub: "Semantic search across your pool" },
  { Icon: FileText, label: "CV parsing",            sub: "Structured extraction instantly" },
  { Icon: Bell,     label: "Availability tracking", sub: "One-click email confirmation" },
  { Icon: Target,   label: "Smart shortlists",      sub: "Ranked candidates with rationale" },
];

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <div className="min-h-screen bg-bg flex">
      {/* ── Left panel (brand) ─── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #09090b 0%, #0f0f13 40%, #111120 100%)" }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />
        {/* Glow orbs */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full opacity-[0.08] blur-2xl"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
        />

        {/* Content */}
        <div className="relative z-10 text-center px-12 max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 mb-6 animate-float shadow-lg shadow-blue-500/30">
            <span className="font-display font-black text-3xl text-white leading-none">N</span>
          </div>
          <h1 className="font-display text-4xl xl:text-5xl font-bold text-white mb-3 tracking-tight">
            Nano
          </h1>
          <p className="text-white/50 text-base mb-10 tracking-wide">
            Talent Platform by Sajal Tech
          </p>

          <div className="grid grid-cols-2 gap-4 text-left">
            {features.map(({ Icon, label, sub }) => (
              <div
                key={label}
                className="p-4 rounded-xl border border-white/[0.07] bg-white/[0.03]"
              >
                <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center mb-3">
                  <Icon className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-white/80 text-sm font-medium mb-1">{label}</p>
                <p className="text-white/35 text-xs leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ─── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-bg">
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-display font-black text-lg text-white">N</span>
            </div>
            <div>
              <span className="font-display font-bold text-text-light text-lg">Nano</span>
              <span className="text-text-muted text-xs ml-2">by Sajal Tech</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-text-light mb-1.5">
              Welcome back
            </h2>
            <p className="text-text-dim text-sm">
              Sign in to your admin dashboard
            </p>
          </div>

          <LoginForm />

          <p className="mt-8 text-center text-xs text-text-muted">
            Need access?{" "}
            <a href="mailto:contact@sajaltech.com" className="text-primary hover:underline">
              Contact Sajal Tech
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
