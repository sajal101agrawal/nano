"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, User, Briefcase, Mail, CheckCircle, ChevronRight, ArrowLeft } from "lucide-react";

const CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "outlook.co.uk", "outlook.in",
  "live.com", "icloud.com", "me.com", "mac.com", "msn.com", "aol.com",
  "protonmail.com", "proton.me", "tutanota.com", "zoho.com", "yandex.com",
  "rediffmail.com", "fastmail.com", "gmx.com", "gmx.net",
]);

function isConsumerDomain(email: string): boolean {
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2) return true;
  return CONSUMER_DOMAINS.has(parts[1]);
}

type Step = "form" | "otp";

interface CompanySuggestion {
  id: string;
  name: string;
  domain: string | null;
}

function FieldWrapper({ children, label, hint, error, icon: Icon }: {
  children: React.ReactNode;
  label: string;
  hint?: string;
  error?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[13px] font-medium text-text-dim">
        {Icon && <Icon className="w-3.5 h-3.5 text-text-muted" />}
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-red-400 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-red-400 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export default function StaffingRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailValid, setEmailValid] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanySuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState("");
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (companyInput.length < 1) { setSuggestions([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/staffing/companies?q=${encodeURIComponent(companyInput)}`);
        const data = await res.json();
        if (data.success) setSuggestions(data.data || []);
      } catch { setSuggestions([]); }
    }, 200);
    return () => clearTimeout(timeout);
  }, [companyInput]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function validateEmail(val: string) {
    if (!val) { setEmailError(""); setEmailValid(false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setEmailError("Invalid email address"); setEmailValid(false); return;
    }
    if (isConsumerDomain(val.trim())) {
      setEmailError("Please use your company email — personal providers are not accepted.");
      setEmailValid(false); return;
    }
    setEmailError(""); setEmailValid(true);
  }

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    if (emailError) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/staffing/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!data.success) setError(data.error || "Failed to send verification code");
      else setStep("otp");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setOtpLoading(true); setError("");
    try {
      const res = await fetch("/api/staffing/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), designation: designation.trim(),
          email: email.trim(), code: code.trim(),
          companyId: selectedCompany?.id || null,
          companyName: selectedCompany ? null : companyInput.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Registration failed");
        if (data.error?.includes("already exists")) setTimeout(() => router.push("/staffing/login"), 2000);
      } else {
        router.push("/staffing/portal");
        router.refresh();
      }
    } catch { setError("Network error. Please try again."); }
    finally { setOtpLoading(false); }
  }

  const canSubmit = !loading && !emailError && name.trim() && email.trim() && companyInput.trim();

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href="/jobs" className="inline-block mb-5">
          <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-7 w-auto mx-auto" />
        </Link>
        <h1 className="font-display text-[26px] font-bold text-text-light tracking-tight">
          {step === "form" ? "Register your company" : "Verify your email"}
        </h1>
        <p className="text-text-dim text-sm mt-2 leading-relaxed">
          {step === "form"
            ? "Set up your staffing company account to start submitting resources."
            : <span>A 6-digit code was sent to <strong className="text-text-light">{email}</strong></span>}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 mb-6">
        {[
          { num: 1, label: "Details", done: step === "otp" },
          { num: 2, label: "Verify", done: false },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-8 ${step === "otp" ? "bg-violet-500/50" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 transition-colors ${
              s.done ? "text-violet-400" : step === "otp" && i === 1 ? "text-text-light" : i === 0 && step === "form" ? "text-text-light" : "text-text-muted"
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${
                s.done
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-400"
                  : (i === 0 && step === "form") || (i === 1 && step === "otp")
                    ? "bg-primary border-primary text-white"
                    : "bg-bg-secondary border-border text-text-muted"
              }`}>
                {s.done ? <CheckCircle className="w-3 h-3" /> : s.num}
              </div>
              <span className="text-[12px] font-medium">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="bg-bg-secondary border border-border rounded-2xl shadow-sm overflow-hidden">
        {step === "form" ? (
          <form onSubmit={handleRequestOTP}>
            <div className="p-6 space-y-5">

              {/* Name + Designation */}
              <div className="grid grid-cols-2 gap-4">
                <FieldWrapper label="Your name" icon={User}>
                  <div className="relative">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      className="input-base w-full"
                      required
                      autoFocus
                    />
                  </div>
                </FieldWrapper>
                <FieldWrapper label="Designation" hint="Optional">
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Account Manager"
                    className="input-base w-full"
                  />
                </FieldWrapper>
              </div>

              {/* Company */}
              <FieldWrapper
                label="Company name"
                icon={Building2}
              >
                <div className="relative" ref={suggestionsRef}>
                  <input
                    type="text"
                    value={companyInput}
                    onChange={(e) => {
                      setCompanyInput(e.target.value);
                      setSelectedCompany(null);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Search or enter your company name"
                    className={`input-base w-full pr-8 ${selectedCompany ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
                    required
                  />
                  {selectedCompany && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-30 mt-1.5 bg-bg border border-border rounded-xl shadow-lg overflow-hidden">
                      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Existing companies</p>
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-bg-hover flex items-center justify-between gap-3 transition-colors"
                          onClick={() => {
                            setSelectedCompany(s);
                            setCompanyInput(s.name);
                            setShowSuggestions(false);
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-md bg-bg-tertiary flex items-center justify-center shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-text-muted" />
                            </div>
                            <span className="text-sm font-medium text-text-light truncate">{s.name}</span>
                          </div>
                          {s.domain && (
                            <span className="text-[11px] text-text-muted shrink-0">@{s.domain}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCompany && (
                  <p className="text-[12px] text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle className="w-3 h-3" />
                    Joining existing company: {selectedCompany.name}
                  </p>
                )}
              </FieldWrapper>

              {/* Email */}
              <FieldWrapper
                label="Company email"
                icon={Mail}
                hint={!emailError ? "Must match your company domain. Personal providers (Gmail, etc.) are not accepted." : undefined}
                error={emailError}
              >
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); validateEmail(e.target.value); }}
                    onBlur={(e) => validateEmail(e.target.value)}
                    placeholder="you@yourcompany.com"
                    className={`input-base w-full pr-8 transition-all ${
                      emailError
                        ? "border-red-500/60 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                        : emailValid
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : ""
                    }`}
                    required
                  />
                  {emailValid && !emailError && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
                  )}
                </div>
              </FieldWrapper>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-bg-tertiary/40">
              <button
                type="submit"
                className="btn btn-primary w-full justify-center gap-2"
                disabled={!canSubmit}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="p-6 space-y-5">
              {/* Email display */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg-tertiary border border-border">
                <Mail className="w-4 h-4 text-text-muted shrink-0" />
                <span className="text-sm text-text-dim truncate">{email}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-text-dim block">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="input-base w-full text-center tracking-[0.6em] text-lg font-mono"
                  autoFocus
                  maxLength={6}
                  required
                />
                <p className="text-[12px] text-text-muted">Enter the 6-digit code. Valid for 10 minutes.</p>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-bg-tertiary/40 space-y-2">
              <button
                type="submit"
                className="btn btn-primary w-full justify-center gap-2"
                disabled={otpLoading || code.length !== 6}
              >
                {otpLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Creating account...
                  </>
                ) : "Create account"}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full text-sm gap-1.5"
                onClick={() => { setStep("form"); setCode(""); setError(""); }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to details
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-text-muted mt-5">
        Already registered?{" "}
        <Link href="/staffing/login" className="text-primary hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
