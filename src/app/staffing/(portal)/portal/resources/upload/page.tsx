"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, FileText, CheckCircle, XCircle, Loader2, ArrowLeft, Download } from "lucide-react";

interface UploadResult {
  filename: string;
  resourceId: string;
  status: "queued" | "failed" | "skipped";
  error?: string;
}

const CSV_TEMPLATE_HEADERS = "name,email,phone,title,experience,location,skills,availability,rate,notice_period";
const CSV_TEMPLATE_EXAMPLE = "John Doe,johndoe@example.com,+91 98765 43210,Senior Java Developer,8,Bangalore India,\"Java,Spring Boot,AWS\",available,90/hr,30";

export default function BulkUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"cv" | "csv">("cv");
  const [files, setFiles] = useState<File[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [csvError, setCsvError] = useState("");
  const [csvUploadResult, setCsvUploadResult] = useState<{ created: number; errors: string[] } | null>(null);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"].includes(f.type)
    );
    setFiles((prev) => [...prev, ...dropped].slice(0, 50));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected].slice(0, 50));
    }
  }

  async function handleCVUpload() {
    if (!files.length) return;
    setUploading(true);
    setResults(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/staffing/resources/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
      }
    } catch {
      setResults([]);
    } finally {
      setUploading(false);
    }
  }

  function parseCSV(text: string): Array<Record<string, string>> {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    return lines.slice(1).map((line) => {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === "," && !inQuotes) { values.push(current); current = ""; }
        else current += char;
      }
      values.push(current);
      return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() || ""]));
    });
  }

  function handleCSVSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target?.result as string);
        if (!rows.length) {
          setCsvError("CSV appears empty or invalid.");
          setCsvRows([]);
        } else {
          setCsvRows(rows);
        }
      } catch {
        setCsvError("Failed to parse CSV file.");
        setCsvRows([]);
      }
    };
    reader.readAsText(file);
  }

  async function handleCSVUpload() {
    if (!csvRows.length) return;
    setUploading(true);
    setCsvUploadResult(null);

    try {
      const res = await fetch("/api/staffing/resources/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: csvRows }),
      });
      const data = await res.json();
      if (data.success) {
        setCsvUploadResult(data.data);
      }
    } catch {
      setCsvError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    const content = `${CSV_TEMPLATE_HEADERS}\n${CSV_TEMPLATE_EXAMPLE}`;
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resources_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const queued = results?.filter((r) => r.status === "queued").length || 0;
  const failed = results?.filter((r) => r.status === "failed" || r.status === "skipped").length || 0;

  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/staffing/portal/resources" className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-bg-hover transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-muted" />
        </Link>
        <div>
          <h1 className="section-title">Bulk Upload</h1>
          <p className="section-subtitle">Upload multiple CVs or import via CSV</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-bg-secondary border border-border rounded-lg p-1 w-fit">
        <button
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "cv" ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text-dim"}`}
          onClick={() => setTab("cv")}
        >
          CV Files
        </button>
        <button
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "csv" ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text-dim"}`}
          onClick={() => setTab("csv")}
        >
          CSV Import
        </button>
      </div>

      {tab === "cv" ? (
        <div className="space-y-4">
          {!results ? (
            <>
              <div
                className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-border-hover transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-text-light font-medium">Drop CV files here or click to browse</p>
                <p className="text-sm text-text-muted mt-1">PDF and DOCX files, up to 50 at a time</p>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc" className="hidden" onChange={handleFileSelect} />
              </div>

              {files.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-medium text-text-light">{files.length} file{files.length !== 1 ? "s" : ""} selected</span>
                    <button type="button" className="text-xs text-text-muted hover:text-red-400" onClick={() => setFiles([])}>Clear all</button>
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <FileText className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="text-sm text-text-dim truncate flex-1">{f.name}</span>
                        <span className="text-xs text-text-muted shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                        <button type="button" className="text-text-muted hover:text-red-400" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-border">
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      onClick={handleCVUpload}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</span>
                      ) : (
                        `Upload ${files.length} CV${files.length !== 1 ? "s" : ""}`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <h2 className="font-semibold text-text-light">Upload complete</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="stat-card text-center py-3">
                  <div className="font-display text-2xl font-bold text-emerald-400">{queued}</div>
                  <div className="text-xs text-text-muted mt-0.5">Queued for processing</div>
                </div>
                <div className="stat-card text-center py-3">
                  <div className="font-display text-2xl font-bold text-red-400">{failed}</div>
                  <div className="text-xs text-text-muted mt-0.5">Failed / Skipped</div>
                </div>
              </div>
              {failed > 0 && (
                <div className="space-y-1">
                  {results.filter((r) => r.status !== "queued").map((r, i) => (
                    <p key={i} className="text-xs text-red-400">{r.filename}: {r.error}</p>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Link href="/staffing/portal/resources" className="btn btn-primary">View Resources</Link>
                <button type="button" className="btn btn-secondary" onClick={() => { setResults(null); setFiles([]); }}>Upload more</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-text-light text-sm">Import from CSV</h2>
              <button type="button" className="btn btn-ghost btn-sm inline-flex items-center gap-1.5" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" />
                Download template
              </button>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Required column: <code className="bg-bg-tertiary px-1 rounded">name</code>. Optional: email, phone, title, experience, location, skills (comma-separated in quotes), availability, rate, notice_period.
            </p>
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-border-hover transition-colors"
              onClick={() => csvInputRef.current?.click()}
            >
              <FileText className="w-7 h-7 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-light">{csvFile ? csvFile.name : "Click to select CSV file"}</p>
              <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVSelect} />
            </div>
            {csvError && <p className="text-sm text-red-400 mt-2">{csvError}</p>}
            {csvRows.length > 0 && !csvUploadResult && (
              <div className="mt-4">
                <p className="text-sm text-text-dim mb-3">{csvRows.length} rows ready to import</p>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={handleCSVUpload}
                  disabled={uploading}
                >
                  {uploading ? "Importing..." : `Import ${csvRows.length} resources`}
                </button>
              </div>
            )}
            {csvUploadResult && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="stat-card text-center py-3">
                    <div className="font-display text-2xl font-bold text-emerald-400">{csvUploadResult.created}</div>
                    <div className="text-xs text-text-muted mt-0.5">Resources created</div>
                  </div>
                  <div className="stat-card text-center py-3">
                    <div className="font-display text-2xl font-bold text-red-400">{csvUploadResult.errors.length}</div>
                    <div className="text-xs text-text-muted mt-0.5">Errors</div>
                  </div>
                </div>
                {csvUploadResult.errors.length > 0 && (
                  <div className="space-y-1">
                    {csvUploadResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-400">{e}</p>
                    ))}
                  </div>
                )}
                <Link href="/staffing/portal/resources" className="btn btn-primary block text-center">View Resources</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
