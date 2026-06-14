"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, ChevronRight, ArrowLeft } from "lucide-react";

type Step = "email" | "otp";

export default function StaffingLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notRegistered, setNotRegistered] = useState(false);

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setNotRegistered(false);
    try {
      const res = await fetch("/api/staffing/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!data.success) setError(data.error || "Failed to send code");
      else setStep("otp");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/staffing/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.notRegistered) setNotRegistered(true);
        setError(data.error || "Invalid code");
      } else {
        router.push("/staffing/portal");
        router.refresh();
      }
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href="/jobs" className="inline-block mb-5">
          <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-7 w-auto mx-auto" />
        </Link>
        <h1 className="font-display text-[26px] font-bold text-text-light tracking-tight">
          {step === "email" ? "Sign in to your account" : "Check your email"}
        </h1>
        <p className="text-text-dim text-sm mt-2">
          {step === "email"
            ? "Enter your company email to receive a login code"
            : <span>Code sent to <strong className="text-text-light">{email}</strong></span>}
        </p>
      </div>

      {/* Card */}
      <div className="bg-bg-secondary border border-border rounded-2xl shadow-sm overflow-hidden">
        {step === "email" ? (
          <form onSubmit={handleRequestOTP}>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[13px] font-medium text-text-dim">
                  <Mail className="w-3.5 h-3.5 text-text-muted" />
                  Company email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcompany.com"
                  className="input-base w-full"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-bg-tertiary/40">
              <button
                type="submit"
                className="btn btn-primary w-full justify-center gap-2"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    Send login code
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP}>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-text-dim block">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="input-base w-full text-center tracking-[0.6em] text-lg font-mono"
                  required
                  autoFocus
                  maxLength={6}
                />
                <p className="text-[12px] text-text-muted">
                  Enter the 6-digit code. Valid for 10 minutes.
                </p>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                  {notRegistered && (
                    <p className="mt-1">
                      No account found.{" "}
                      <Link href="/staffing/register" className="text-primary hover:underline font-medium">
                        Register your company
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-bg-tertiary/40 space-y-2">
              <button
                type="submit"
                className="btn btn-primary w-full justify-center gap-2"
                disabled={loading || code.length !== 6}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Verifying...
                  </>
                ) : "Sign in"}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full text-sm gap-1.5"
                onClick={() => { setStep("email"); setCode(""); setError(""); }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-text-muted mt-5">
        New to the portal?{" "}
        <Link href="/staffing/register" className="text-primary hover:underline font-medium">
          Register your company
        </Link>
      </p>
    </div>
  );
}
