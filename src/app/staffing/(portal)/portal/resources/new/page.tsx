"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, X } from "lucide-react";

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
  { value: "unknown", label: "Unknown" },
];

const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "flexible", label: "Flexible" },
];

export default function NewResourcePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", current_title: "", current_company: "",
    total_experience_years: "", location: "", work_mode: "", skills: "",
    availability_status: "available", expected_rate: "", rate_currency: "INR",
    notice_period_days: "", notes: "",
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);

      const res = await fetch("/api/staffing/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          skills,
          total_experience_years: form.total_experience_years ? parseFloat(form.total_experience_years) : null,
          notice_period_days: form.notice_period_days ? parseInt(form.notice_period_days) : null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to create resource");
        setLoading(false);
        return;
      }

      const resourceId = data.data.id;

      if (cvFile) {
        const formData = new FormData();
        formData.append("files", cvFile);
        await fetch("/api/staffing/resources/upload", { method: "POST", body: formData });
      }

      router.push(`/staffing/portal/resources/${resourceId}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/staffing/portal/resources" className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-bg-hover transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-muted" />
        </Link>
        <div>
          <h1 className="section-title">Add Resource</h1>
          <p className="section-subtitle">Add a resource to your pool</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card p-5 space-y-4">
          <h2 className="font-display font-semibold text-text-light text-sm">Basic Information</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Full name *</label>
              <input type="text" className="input-base w-full" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="form-label">Current title</label>
              <input type="text" className="input-base w-full" value={form.current_title} onChange={(e) => set("current_title", e.target.value)} placeholder="e.g. Senior Java Developer" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="input-base w-full" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input type="text" className="input-base w-full" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Current company</label>
              <input type="text" className="input-base w-full" value={form.current_company} onChange={(e) => set("current_company", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Experience (years)</label>
              <input type="number" step="0.5" min="0" className="input-base w-full" value={form.total_experience_years} onChange={(e) => set("total_experience_years", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="font-display font-semibold text-text-light text-sm">Skills & Availability</h2>
          <div>
            <label className="form-label">Skills</label>
            <input
              type="text"
              className="input-base w-full"
              value={form.skills}
              onChange={(e) => set("skills", e.target.value)}
              placeholder="Java, Spring Boot, AWS, React (comma-separated)"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Availability</label>
              <select className="input-base w-full" value={form.availability_status} onChange={(e) => set("availability_status", e.target.value)}>
                {AVAILABILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Work mode</label>
              <select className="input-base w-full" value={form.work_mode} onChange={(e) => set("work_mode", e.target.value)}>
                <option value="">Select...</option>
                {WORK_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Notice (days)</label>
              <input type="number" min="0" className="input-base w-full" value={form.notice_period_days} onChange={(e) => set("notice_period_days", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="form-label">Location</label>
            <input type="text" className="input-base w-full" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City, Country" />
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="font-display font-semibold text-text-light text-sm">CV Upload (optional)</h2>
          <p className="text-xs text-text-muted -mt-2">Upload a CV and our AI will extract detailed profile information automatically.</p>
          {cvFile ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-bg-tertiary border border-border rounded-lg">
              <FileText className="w-4 h-4 text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-light truncate">{cvFile.name}</p>
                <p className="text-xs text-text-muted">{(cvFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button type="button" onClick={() => setCvFile(null)} className="p-1 rounded text-text-muted hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              className="drop-zone p-6 text-center"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setCvFile(f); }}
            >
              <Upload className="w-6 h-6 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-dim">Drop a PDF or DOCX file here, or click to browse</p>
              <p className="text-xs text-text-muted mt-1">Max 10 MB</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setCvFile(e.target.files[0]); }} />
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="font-display font-semibold text-text-light text-sm">Rate & Notes</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="form-label">Expected rate</label>
              <input type="text" className="input-base w-full" value={form.expected_rate} onChange={(e) => set("expected_rate", e.target.value)} placeholder="e.g. 80/hr or 12L/yr" />
            </div>
            <div>
              <label className="form-label">Currency</label>
              <select className="input-base w-full" value={form.rate_currency} onChange={(e) => set("rate_currency", e.target.value)}>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea rows={3} className="input-base w-full" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any additional notes..." />
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Add Resource"}
          </button>
          <Link href="/staffing/portal/resources" className="btn btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
