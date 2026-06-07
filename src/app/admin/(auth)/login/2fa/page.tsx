"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";

export default function TwoFactorPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

  const code = digits.join("");

  // Auto-submit when all 6 filled
  useEffect(() => {
    if (code.length === 6 && !loading) {
      handleVerify();
    }
  }, [code]);

  async function handleVerify() {
    if (code.length !== 6) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        setDigits(Array(6).fill(""));
        setTimeout(() => refs.current[0]?.focus(), 50);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setError("");

    if (v && index < 5) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[340px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
            <span className="font-display font-black text-white text-sm">N</span>
          </div>
          <span className="font-display font-bold text-text-light">Nano</span>
          <span className="text-text-muted text-xs">by Sajal Tech</span>
        </div>

        <div className="mb-7">
          <h1 className="font-display text-2xl font-bold text-text-light mb-1.5">
            Two-factor auth
          </h1>
          <p className="text-text-dim text-sm">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/15 rounded-lg px-4 py-3">
              <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 text-red-400 text-[10px] font-bold">!</span>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Digit inputs */}
          <div className="flex gap-2 justify-between" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`otp-digit flex-1 min-w-0 ${d ? "filled" : ""}`}
                autoFocus={i === 0}
                disabled={loading}
              />
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-text-muted py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying…</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push("/admin/login")}
            className="btn btn-ghost w-full justify-center gap-1.5 text-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
