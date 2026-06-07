"use client";
import { useState } from "react";
import { Loader2, CheckCircle, Shield, User, List, Building2 } from "lucide-react";

interface UserData { id: string; email: string; name: string; role: string; totp_enabled: boolean; }
interface AgencyData { agency_name: string; agency_tagline: string; agency_email: string; agency_phone: string; agency_website: string; agency_address: string; }

export function SettingsForm({ user, suppressedCount, agency: initialAgency }: {
  user: UserData;
  suppressedCount: number;
  agency: AgencyData;
}) {
  const tabs = [
    { id: "profile",  label: "Profile",  icon: User },
    { id: "agency",   label: "Agency",   icon: Building2 },
    { id: "security", label: "Security", icon: Shield },
    { id: "suppression", label: "Suppression", icon: List },
  ] as const;
  type Tab = typeof tabs[number]["id"];

  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Agency
  const [agency, setAgency] = useState<AgencyData>(initialAgency);
  const [agencySaving, setAgencySaving] = useState(false);
  const [agencyMsg, setAgencyMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function saveAgency() {
    setAgencySaving(true); setAgencyMsg(null);
    const res = await fetch("/api/admin/settings/agency", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agency),
    });
    const d = await res.json();
    setAgencyMsg(res.ok ? { type: "ok", text: "Agency settings saved" } : { type: "err", text: d.error || "Failed" });
    setAgencySaving(false);
  }

  const [totpData, setTotpData] = useState<{ qrCode: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpMsg, setTotpMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(user.totp_enabled);

  async function saveProfile() {
    setSaving(true); setProfileMsg(null);
    const res = await fetch("/api/admin/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    setProfileMsg(res.ok ? { type: "ok", text: "Profile updated" } : { type: "err", text: d.error || "Failed" });
    setSaving(false);
  }

  async function setupTOTP() {
    setTotpLoading(true); setTotpMsg(null);
    const res = await fetch("/api/admin/settings/2fa/setup", { method: "POST" });
    const d = await res.json();
    if (res.ok) setTotpData(d);
    else setTotpMsg({ type: "err", text: d.error || "Setup failed" });
    setTotpLoading(false);
  }

  async function enableTOTP() {
    if (totpCode.length !== 6 || !totpData) return;
    setTotpLoading(true); setTotpMsg(null);
    const res = await fetch("/api/admin/settings/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode, secret: totpData.secret }),
    });
    const d = await res.json();
    if (res.ok) {
      setTotpEnabled(true); setTotpData(null); setTotpCode("");
      setTotpMsg({ type: "ok", text: "Two-factor authentication enabled!" });
    } else {
      setTotpMsg({ type: "err", text: d.error || "Invalid code" });
    }
    setTotpLoading(false);
  }

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-0.5 bg-bg-tertiary p-1 rounded-xl mb-6 w-fit border border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === id ? "bg-bg-secondary text-text-light shadow-xs" : "text-text-muted hover:text-text-dim",
            ].join(" ")}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <div className="card p-6 space-y-5">
          <div>
            <label className="form-label">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="form-label">Email address</label>
            <input value={user.email} disabled className="input-base opacity-50 cursor-not-allowed" />
            <p className="text-xs text-text-muted mt-1.5">Email cannot be changed from here.</p>
          </div>
          <div>
            <label className="form-label">Role</label>
            <div className="flex items-center gap-2">
              <span className="badge badge-blue capitalize">{user.role}</span>
            </div>
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {profileMsg.text}
            </p>
          )}
          <button onClick={saveProfile} disabled={saving} className="btn btn-primary">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving…</span></> : "Save changes"}
          </button>
        </div>
      )}

      {/* Agency tab */}
      {tab === "agency" && (
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="font-display font-semibold text-text-light mb-1">Agency Details</h2>
            <p className="text-sm text-text-dim">These details appear on client-facing CVs and profile PDFs.</p>
          </div>
          {(["agency_name", "agency_tagline", "agency_email", "agency_phone", "agency_website", "agency_address"] as const).map((key) => (
            <div key={key}>
              <label className="form-label capitalize">{key.replace("agency_", "").replace(/_/g, " ")}</label>
              <input
                value={agency[key]}
                onChange={(e) => setAgency((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={key === "agency_email" ? "contact@example.com" : key === "agency_phone" ? "+91 XXXXX XXXXX" : ""}
                className="input-base"
              />
            </div>
          ))}
          {agencyMsg && (
            <p className={`text-sm ${agencyMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{agencyMsg.text}</p>
          )}
          <button onClick={saveAgency} disabled={agencySaving} className="btn btn-primary">
            {agencySaving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving…</span></> : "Save agency settings"}
          </button>
        </div>
      )}

      {/* Security tab */}
      {tab === "security" && (
        <div className="card p-6">
          <h2 className="font-display font-semibold text-text-light mb-1">Two-factor authentication</h2>
          <p className="text-sm text-text-dim mb-5">
            Add an extra layer of security by requiring a time-based one-time password (TOTP) on sign-in.
          </p>

          {totpEnabled && !totpData && (
            <div className="flex items-center gap-2.5 bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-4 mb-4">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-400">2FA is enabled</p>
                <p className="text-xs text-text-muted mt-0.5">Your account is protected with an authenticator app.</p>
              </div>
            </div>
          )}

          {totpMsg && (
            <p className={`text-sm mb-4 ${totpMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {totpMsg.text}
            </p>
          )}

          {!totpEnabled && !totpData && (
            <button onClick={setupTOTP} disabled={totpLoading} className="btn btn-secondary">
              {totpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Loading…</span></> : "Set up 2FA"}
            </button>
          )}

          {totpData && (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-text-dim mb-3">
                  Scan this QR code with Google Authenticator, Authy, or any TOTP app:
                </p>
                <div className="inline-block bg-white p-4 rounded-xl">
                  <img src={totpData.qrCode} alt="2FA QR Code" className="w-40 h-40" />
                </div>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5">Manual entry key:</p>
                <code className="text-xs bg-bg-tertiary border border-border px-3 py-2 rounded-lg break-all block font-mono text-text-dim">
                  {totpData.secret}
                </code>
              </div>
              <div>
                <label className="form-label">Enter the 6-digit code to verify</label>
                <div className="flex gap-2">
                  <input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="input-base w-36 text-center font-mono text-lg tracking-widest"
                    maxLength={6}
                    inputMode="numeric"
                  />
                  <button
                    onClick={enableTOTP}
                    disabled={totpLoading || totpCode.length !== 6}
                    className="btn btn-primary"
                  >
                    {totpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suppression tab */}
      {tab === "suppression" && (
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="font-display font-semibold text-text-light mb-1">Suppression List</h2>
            <p className="text-sm text-text-dim">
              Email addresses that have unsubscribed or bounced. Outreach emails are never sent to these addresses.
            </p>
          </div>
          <div className="bg-bg-tertiary border border-border rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold font-display text-text-light tabular-nums">{suppressedCount}</p>
              <p className="text-sm text-text-muted mt-0.5">suppressed addresses</p>
            </div>
            <div className="badge badge-gray text-sm px-3 py-1.5">
              {suppressedCount === 0 ? "Empty" : "Active"}
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Addresses are added automatically on unsubscribe, bounce, or spam complaint. You can also add addresses manually via the API.
          </p>
        </div>
      )}
    </div>
  );
}
