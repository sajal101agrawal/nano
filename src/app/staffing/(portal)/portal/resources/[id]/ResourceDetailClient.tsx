"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import type { StaffingResource, StaffingResourceProfile } from "@/types";

type ResourceWithProfile = StaffingResource & {
  profile_id?: string;
  raw_cv_url?: string;
  raw_cv_filename?: string;
  parsed_json?: Record<string, unknown>;
  summary?: string;
  profile_parse_status?: string;
  profile_parse_error?: string;
};

function availabilityColor(status: string) {
  if (status === "available") return "text-emerald-400";
  if (status === "unavailable") return "text-red-400";
  return "text-amber-400";
}

export function ResourceDetailClient({ resource: initial }: { resource: ResourceWithProfile }) {
  const router = useRouter();
  const [resource, setResource] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    availability_status: initial.availability_status,
    notes: initial.notes || "",
    expected_rate: initial.expected_rate || "",
    notice_period_days: initial.notice_period_days?.toString() || "",
  });
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function saveAvailability(newStatus: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/staffing/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability_status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        const validStatus = newStatus as "available" | "unavailable" | "unknown";
        setResource((r) => ({ ...r, availability_status: validStatus }));
        setForm((f) => ({ ...f, availability_status: validStatus }));
      }
    } catch {
      setError("Failed to update availability.");
    } finally {
      setSaving(false);
    }
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/staffing/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: form.notes,
          expected_rate: form.expected_rate,
          notice_period_days: form.notice_period_days ? parseInt(form.notice_period_days) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResource(data.data);
        setEditing(false);
      } else {
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this resource from your pool?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/staffing/resources/${resource.id}`, { method: "DELETE" });
      router.push("/staffing/portal/resources");
    } catch {
      setDeleting(false);
    }
  }

  const AVAILABILITY_OPTIONS = [
    { value: "available", label: "Available", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
    { value: "unavailable", label: "Unavailable", color: "bg-red-500/10 border-red-500/30 text-red-400" },
    { value: "unknown", label: "Unknown", color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  ];

  return (
    <div className="page-container max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/staffing/portal/resources" className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-bg-hover transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-muted" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="section-title truncate">{resource.full_name || "Unnamed Resource"}</h1>
          {resource.current_title && <p className="section-subtitle">{resource.current_title}</p>}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn btn-ghost btn-sm text-red-400 hover:bg-red-500/10"
        >
          {deleting ? "Removing..." : "Remove"}
        </button>
      </div>

      {/* Availability toggle */}
      <div className="card p-5 mb-4">
        <h2 className="font-display font-semibold text-text-light text-sm mb-3">Availability</h2>
        <div className="flex gap-2">
          {AVAILABILITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => saveAvailability(o.value)}
              disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                resource.availability_status === o.value
                  ? o.color
                  : "border-border text-text-muted hover:border-border-hover"
              }`}
            >
              {resource.availability_status === o.value && <Check className="w-3.5 h-3.5" />}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Profile / CV info */}
      {resource.profile_parse_status && (
        <div className="card p-5 mb-4">
          <h2 className="font-display font-semibold text-text-light text-sm mb-3">CV & Profile</h2>
          {(resource.profile_parse_status === "pending" || resource.profile_parse_status === "processing") && (
            <p className="text-sm text-blue-400">CV is being processed by AI. This may take a minute.</p>
          )}
          {resource.profile_parse_status === "completed" && resource.summary && (
            <p className="text-sm text-text-dim leading-relaxed">{resource.summary}</p>
          )}
          {resource.profile_parse_status === "failed" && (
            <p className="text-sm text-red-400">CV parsing failed. {resource.profile_parse_error}</p>
          )}
          {resource.raw_cv_filename && (
            <p className="text-xs text-text-muted mt-2">{resource.raw_cv_filename}</p>
          )}
        </div>
      )}

      {/* Details */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-text-light text-sm">Details</h2>
          <button type="button" onClick={() => setEditing(!editing)} className="text-xs text-primary hover:underline">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <form onSubmit={saveForm} className="space-y-3">
            <div>
              <label className="form-label">Notes</label>
              <textarea rows={3} className="input-base w-full" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Expected rate</label>
                <input type="text" className="input-base w-full" value={form.expected_rate} onChange={(e) => setForm((f) => ({ ...f, expected_rate: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Notice period (days)</label>
                <input type="number" min="0" className="input-base w-full" value={form.notice_period_days} onChange={(e) => setForm((f) => ({ ...f, notice_period_days: e.target.value }))} />
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              { label: "Email", value: resource.email },
              { label: "Phone", value: resource.phone },
              { label: "Location", value: resource.location },
              { label: "Experience", value: resource.total_experience_years ? `${resource.total_experience_years} years` : null },
              { label: "Notice period", value: resource.notice_period_days != null ? `${resource.notice_period_days} days` : null },
              { label: "Expected rate", value: resource.expected_rate ? `${resource.expected_rate} ${resource.rate_currency || ""}` : null },
            ].map(({ label, value }) =>
              value ? (
                <div key={label}>
                  <dt className="text-xs text-text-muted">{label}</dt>
                  <dd className="text-sm text-text-light mt-0.5">{value}</dd>
                </div>
              ) : null
            )}
            {resource.skills?.length ? (
              <div className="col-span-2">
                <dt className="text-xs text-text-muted mb-1">Skills</dt>
                <dd className="flex flex-wrap gap-1">
                  {resource.skills.map((s) => (
                    <span key={s} className="badge badge-gray">{s}</span>
                  ))}
                </dd>
              </div>
            ) : null}
            {resource.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-text-muted">Notes</dt>
                <dd className="text-sm text-text-dim mt-0.5 whitespace-pre-wrap">{resource.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
