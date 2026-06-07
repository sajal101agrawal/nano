"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Step = "identifier" | "code";

function detectIdentifierType(value: string): "email" | "phone" {
  const trimmed = value.trim();
  if (/^\+?[\d\s\-().]{7,}$/.test(trimmed) && !/[@]/.test(trimmed)) {
    return "phone";
  }
  return "email";
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.4 2 2 0 0 1 3.07 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default function OTPAuthCard() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<"email" | "phone">("email");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sliding, setSliding] = useState(false);

  const digitRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));
  const identifierRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const transitionTo = useCallback((target: Step) => {
    setSliding(true);
    setError("");
    setTimeout(() => {
      setStep(target);
      setSliding(false);
    }, 180);
  }, []);

  const handleIdentifierChange = (v: string) => {
    setIdentifier(v);
    setIdentifierType(detectIdentifierType(v));
    setError("");
  };

  const handleSendCode = async () => {
    const trimmed = identifier.trim();
    const type = detectIdentifierType(trimmed);

    if (type === "email" && !isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (type === "phone" && !isValidPhone(trimmed)) {
      setError("Enter a valid phone number.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/candidate/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed, type }),
      });
      const data = await res.json();

      if (data.rateLimited) {
        setError(data.error || "Too many requests. Try again later.");
        setLoading(false);
        return;
      }
      if (!data.success) {
        setError(data.error || "Failed to send code. Try again.");
        setLoading(false);
        return;
      }

      setIdentifierType(type);
      setCountdown(60);
      transitionTo("code");
      setTimeout(() => digitRefs.current[0]?.focus(), 300);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (idx: number, value: string) => {
    const char = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    setError("");

    if (char && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }
    if (char && idx === 5) {
      const code = next.join("");
      if (code.length === 6) handleVerify(next);
    }
  };

  const handleDigitKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = "";
        setDigits(next);
      } else if (idx > 0) {
        digitRefs.current[idx - 1]?.focus();
        const next = [...digits];
        next[idx - 1] = "";
        setDigits(next);
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted.length) return;
    const next = Array(6).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const lastFilled = Math.min(pasted.length, 5);
    digitRefs.current[lastFilled]?.focus();
    if (pasted.length === 6) handleVerify(next);
  };

  const handleVerify = async (digitArr?: string[]) => {
    const code = (digitArr ?? digits).join("");
    if (code.length < 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/candidate/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), type: identifierType, code }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Invalid code. Try again.");
        setDigits(Array(6).fill(""));
        setTimeout(() => digitRefs.current[0]?.focus(), 50);
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setDigits(Array(6).fill(""));
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/candidate/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), type: identifierType }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to resend.");
      } else {
        setCountdown(60);
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flow-card">
      <div
        style={{
          opacity: sliding ? 0 : 1,
          transform: sliding ? "translateX(10px)" : "translateX(0)",
          transition: "opacity 180ms ease, transform 180ms ease",
        }}
      >
        {step === "identifier" ? (
          <div>
            <div className="mb-6">
              <h2
                className="font-display font-bold mb-1"
                style={{
                  fontSize: "20px",
                  color: "var(--color-text-light)",
                  letterSpacing: "-0.025em",
                }}
              >
                Verify your identity
              </h2>
              <p style={{ fontSize: "14px", color: "var(--color-text-dim)" }}>
                We&apos;ll send a 6-digit code to confirm it&apos;s you.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  className="form-label"
                  htmlFor="otp-identifier"
                >
                  Email or phone number
                </label>
                <div className="relative">
                  <div
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {identifierType === "phone" ? <PhoneIcon /> : <EmailIcon />}
                  </div>
                  <input
                    id="otp-identifier"
                    ref={identifierRef}
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com or +91 98765 43210"
                    value={identifier}
                    onChange={(e) => handleIdentifierChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !loading && handleSendCode()}
                    className="input-base"
                    style={{ paddingLeft: "38px" }}
                    disabled={loading}
                    autoFocus
                  />
                </div>
                {identifier.length > 2 && (
                  <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "5px" }}>
                    Detected: <span style={{ color: "var(--color-text-dim)" }}>{identifierType === "email" ? "Email address" : "Phone number"}</span>
                  </p>
                )}
              </div>

              {error && (
                <p
                  className="flex items-start gap-1.5"
                  style={{ fontSize: "13px", color: "var(--color-error)" }}
                >
                  <ErrorIcon />
                  {error}
                </p>
              )}

              <button
                onClick={handleSendCode}
                disabled={loading || identifier.trim().length < 3}
                className="btn btn-primary w-full"
                style={{ padding: "11px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
              >
                {loading ? (
                  <>
                    <SpinnerIcon />
                    Sending code&hellip;
                  </>
                ) : (
                  "Get code"
                )}
              </button>

              <p
                className="text-center"
                style={{ fontSize: "12px", color: "var(--color-text-muted)", paddingTop: "4px" }}
              >
                We&apos;ll send a 6-digit code to verify you
              </p>
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => transitionTo("identifier")}
              className="flex items-center gap-1.5 mb-5 btn btn-ghost"
              style={{ padding: "4px 0", fontSize: "13px" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Change
            </button>

            <div className="mb-6">
              <h2
                className="font-display font-bold mb-1"
                style={{
                  fontSize: "20px",
                  color: "var(--color-text-light)",
                  letterSpacing: "-0.025em",
                }}
              >
                Enter your code
              </h2>
              <p style={{ fontSize: "14px", color: "var(--color-text-dim)" }}>
                Code sent to{" "}
                <span style={{ color: "var(--color-text-light)", fontWeight: 500 }}>
                  {identifier.trim()}
                </span>
              </p>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "3px" }}>
                Check your {identifierType === "email" ? "inbox (and spam folder)" : "messages"}
              </p>
            </div>

            {/* OTP digit boxes */}
            <div
              className="flex gap-2 mb-4"
              onPaste={handleDigitPaste}
            >
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { digitRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  className={`otp-digit${d ? " filled" : ""}`}
                  disabled={loading}
                />
              ))}
            </div>

            {error && (
              <p
                className="flex items-start gap-1.5 mb-3"
                style={{ fontSize: "13px", color: "var(--color-error)" }}
              >
                <ErrorIcon />
                {error}
              </p>
            )}

            <button
              onClick={() => handleVerify()}
              disabled={loading || digits.join("").length < 6}
              className="btn btn-primary w-full mb-4"
              style={{ padding: "11px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
            >
              {loading ? (
                <>
                  <SpinnerIcon />
                  Verifying&hellip;
                </>
              ) : (
                "Verify"
              )}
            </button>

            <div className="text-center">
              {countdown > 0 ? (
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  Resend in <span style={{ color: "var(--color-text-dim)", fontWeight: 500 }}>{countdown}s</span>
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={loading}
                  className="btn btn-ghost"
                  style={{ padding: "4px 8px", fontSize: "13px" }}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
