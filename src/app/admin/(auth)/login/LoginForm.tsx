"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        return;
      }

      if (data.requiresTOTP) {
        router.push("/admin/login/2fa");
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/15 rounded-lg px-4 py-3">
          <span className="mt-0.5 w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 text-red-400 text-[10px] font-bold">!</span>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div>
        <label className="form-label">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input-base"
          required
          autoComplete="email"
          autoFocus
        />
      </div>

      <div>
        <label className="form-label">Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input-base pr-10"
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-dim transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="btn btn-primary w-full mt-2 justify-center"
        style={{ padding: "10px 16px" }}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Signing in…</span>
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
