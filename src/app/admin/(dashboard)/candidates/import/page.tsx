"use client";

import React, { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/cn";

const FIELD_OPTIONS = [
  { value: "", label: "— Skip column —" },
  { value: "full_name", label: "Full Name" },
  { value: "email", label: "Email Address" },
  { value: "phone", label: "Phone" },
  { value: "headline", label: "Job Title / Headline" },
  { value: "current_company", label: "Current Company" },
  { value: "location", label: "Location" },
  { value: "experience_years", label: "Experience (years)" },
  { value: "skills", label: "Skills (comma-separated)" },
  { value: "linkedin_url", label: "LinkedIn URL" },
  { value: "availability", label: "Availability Status" },
];

type PreviewRow = {
  row: number;
  data: Record<string, string>;
  mapped: Record<string, string>;
  errors: string[];
};

type PreviewResult = {
  headers: string[];
  autoMapping: Record<string, string>;
  totalRows: number;
  preview: PreviewRow[];
};

type ImportResult = {
  inserted: number;
  skipped: number;
  errors: { row: number; error: string }[];
};

export default function CandidateImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    setFile(f);
    setPreview(null);
    setResult(null);
    setError("");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "preview");
      fd.append("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/admin/candidates/import", { method: "POST", body: fd });
      const json = await res.json() as { success: boolean; data?: PreviewResult; error?: string };
      if (!json.success) throw new Error(json.error || "Preview failed");
      setPreview(json.data!);
      // Initialize mapping from auto-detected
      setMapping(json.data!.autoMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "import");
      fd.append("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/admin/candidates/import", { method: "POST", body: fd });
      const json = await res.json() as { success: boolean; data?: ImportResult; error?: string };
      if (!json.success) throw new Error(json.error || "Import failed");
      setResult(json.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-container max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-text-dim mb-4">
        <Link href="/admin/candidates" className="hover:text-text-light transition-colors">Candidates</Link>
        <span className="text-text-dim/40">/</span>
        <span>Import CSV</span>
      </div>

      <h1 className="section-title mb-6">Import Candidates from CSV</h1>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/8 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result ? (
        <div className="card p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-lg font-semibold text-text-light">Import Complete</h2>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{result.inserted}</p>
              <p className="text-xs text-text-dim">Imported</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{result.skipped}</p>
              <p className="text-xs text-text-dim">Skipped</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="text-left space-y-1 mt-2">
              <p className="text-xs font-medium text-text-dim">Errors:</p>
              {result.errors.map((e) => (
                <p key={e.row} className="text-xs text-red-400">Row {e.row}: {e.error}</p>
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button onClick={() => { setResult(null); setFile(null); setPreview(null); }}
              className="btn btn-secondary btn-sm">Import another</button>
            <button onClick={() => router.push("/admin/candidates")}
              className="btn btn-primary btn-sm">View candidates</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Upload area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "card p-10 text-center cursor-pointer border-2 border-dashed transition-colors",
              dragging ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-primary/3"
            )}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            {file ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-light">{file.name}</p>
                <p className="text-xs text-text-dim">{(file.size / 1024).toFixed(1)} KB · Click or drag to replace</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-bg-hover border border-border flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <p className="text-sm text-text-dim">Drag & drop a CSV file here, or click to browse</p>
                <p className="text-xs text-text-muted">First row must be headers. Duplicate emails will be updated.</p>
              </div>
            )}
          </div>

          {file && !preview && (
            <div className="flex justify-end">
              <button onClick={handlePreview} disabled={loading} className="btn btn-primary">
                {loading ? "Analyzing…" : "Preview & Map Columns"}
              </button>
            </div>
          )}

          {preview && (
            <>
              {/* Column mapping */}
              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-light">Column Mapping</h2>
                  <span className="text-xs text-text-dim">{preview.totalRows} rows detected</span>
                </div>
                <p className="text-xs text-text-dim">Map your CSV columns to candidate fields. Unmapped columns are ignored.</p>
                <div className="grid grid-cols-2 gap-2">
                  {preview.headers.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-bg rounded-lg border border-border px-3 py-2">
                      <span className="text-xs text-text-dim flex-1 truncate" title={header}>{header}</span>
                      <span className="text-text-dim/30 text-xs">→</span>
                      <select
                        value={mapping[String(idx)] || ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [String(idx)]: e.target.value }))}
                        className="text-xs bg-bg-hover border border-border rounded px-2 py-1 text-text-light focus:outline-none focus:border-primary/50"
                      >
                        {FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-text-light">Preview (first 5 rows)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {FIELD_OPTIONS.filter((o) => o.value && Object.values(mapping).includes(o.value)).map((f) => (
                          <th key={f.value} className="text-left px-4 py-2 text-text-dim font-medium">{f.label}</th>
                        ))}
                        <th className="text-left px-4 py-2 text-text-dim font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.preview.map((row) => (
                        <tr key={row.row} className={cn("hover:bg-bg-hover", row.errors.length > 0 && "bg-red-500/5")}>
                          {FIELD_OPTIONS.filter((o) => o.value && Object.values(mapping).includes(o.value)).map((f) => (
                            <td key={f.value} className="px-4 py-2 text-text-light max-w-[150px] truncate">{row.mapped[f.value] || "—"}</td>
                          ))}
                          <td className="px-4 py-2">
                            {row.errors.length > 0
                              ? <span className="text-red-400">{row.errors[0]}</span>
                              : <span className="text-emerald-400">OK</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-text-dim">{preview.totalRows} rows will be imported. Existing emails will be updated.</p>
                <button onClick={handleImport} disabled={importing} className="btn btn-primary">
                  {importing ? "Importing…" : `Import ${preview.totalRows} Candidates`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
