"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface CVViewerProps {
  candidateId: string;
  filename?: string;
  parseStatus?: string;
  parseError?: string;
}

type ViewState = "idle" | "loading" | "ready" | "error";
type ModalMode = "original" | "client";

function getFileType(filename?: string): "pdf" | "word" | "unknown" {
  const ext = filename?.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "word";
  return "unknown";
}

function getFileIcon(type: "pdf" | "word" | "unknown", className = "w-4 h-4") {
  const color = type === "pdf" ? "text-red-400" : type === "word" ? "text-blue-400" : "text-text-dim";
  return (
    <svg className={`${className} ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

const canRetry = (status?: string) => status === "failed";

export default function CVViewer({
  candidateId,
  filename,
  parseStatus,
  parseError,
}: CVViewerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("original");
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("");
  const [wordHtml, setWordHtml] = useState<string>("");
  const [viewError, setViewError] = useState("");
  const [dlLoading, setDlLoading] = useState(false);
  const [dlError, setDlError] = useState("");
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryDone, setRetryDone] = useState(false);
  const [retryError, setRetryError] = useState("");

  const blobUrlRef = useRef<string>("");
  const fileType = getFileType(filename);

  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, []);

  const loadPreview = useCallback(async (mode: ModalMode) => {
    setModalOpen(true);
    setModalMode(mode);
    setViewState("loading");
    setViewError("");
    setPdfBlobUrl("");
    setWordHtml("");
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }

    try {
      const url = mode === "client"
        ? `/api/admin/candidates/${candidateId}/client-cv`
        : `/api/admin/candidates/${candidateId}/cv-preview`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const arrayBuffer = await res.arrayBuffer();

      if (mode === "client" || fileType === "pdf") {
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        setPdfBlobUrl(blobUrl);
        setViewState("ready");
        return;
      }

      if (fileType === "word") {
        const mammoth = (await import("mammoth/mammoth.browser")) as {
          default?: { convertToHtml: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
          convertToHtml?: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
        };
        const api = mammoth.default ?? mammoth;
        if (!api?.convertToHtml) throw new Error("mammoth not available");
        const result = await api.convertToHtml({ arrayBuffer });
        setWordHtml(result.value);
        setViewState("ready");
        return;
      }

      setViewState("ready");
    } catch (err) {
      setViewError(err instanceof Error ? err.message : "Failed to load document");
      setViewState("error");
    }
  }, [candidateId, fileType]);

  const closeModal = () => {
    setModalOpen(false);
    setViewState("idle");
    setPdfBlobUrl("");
    setWordHtml("");
    setViewError("");
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
  };

  const handleDownloadOriginal = async () => {
    setDlLoading(true);
    setDlError("");
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/cv-url`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to get URL");
      const a = document.createElement("a");
      a.href = json.data.url;
      a.download = json.data.filename || filename || "cv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (err) {
      setDlError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDlLoading(false);
    }
  };

  // Download the currently shown blob (works for both original PDF and client CV)
  const handleDownloadBlob = (defaultName: string) => {
    if (!blobUrlRef.current) return;
    const a = document.createElement("a");
    a.href = blobUrlRef.current;
    a.download = defaultName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleRetry = async () => {
    setRetryLoading(true);
    setRetryError("");
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/cv-reparse`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to queue reparse");
      setRetryDone(true);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryLoading(false);
    }
  };

  const clientCvName = `${filename?.replace(/\.[^.]+$/, "") || "candidate"}_ClientProfile.pdf`;

  return (
    <>
      {/* CV card actions */}
      <div className="space-y-2">
        {/* Row 1: Preview original + Download original */}
        <div className="flex gap-2">
          <button
            onClick={() => loadPreview("original")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors flex-1 justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview CV
          </button>
          <button
            onClick={handleDownloadOriginal}
            disabled={dlLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover disabled:opacity-50 transition-colors flex-1 justify-center"
          >
            {dlLoading
              ? <div className="w-3.5 h-3.5 border-2 border-text-dim/30 border-t-text-dim rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
            {dlLoading ? "Downloading..." : "Download"}
          </button>
        </div>

        {dlError && <p className="text-red-400 text-xs">{dlError}</p>}

        {/* Row 2: Preview Client CV button */}
        <button
          onClick={() => loadPreview("client")}
          className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-1.5 text-sm font-medium rounded-lg border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Preview Client CV
        </button>

        {/* Retry parse */}
        {canRetry(parseStatus) && !retryDone && (
          <button
            onClick={handleRetry}
            disabled={retryLoading}
            className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-1.5 text-sm font-medium rounded-lg border border-amber-500/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 disabled:opacity-50 transition-colors"
          >
            {retryLoading ? (
              <><div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />Queuing...</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Retry Parse</>
            )}
          </button>
        )}
        {retryDone && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-emerald-400 bg-emerald-400/10 rounded-lg border border-emerald-400/20">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Parse queued — refresh in a moment
          </div>
        )}
        {retryError && <p className="text-red-400 text-xs">{retryError}</p>}
      </div>

      {/* Preview Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-4xl h-[90vh] flex flex-col bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {modalMode === "client"
                  ? <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  : getFileIcon(fileType)
                }
                <span className="text-sm font-medium text-text-light truncate">
                  {modalMode === "client" ? `${filename?.replace(/\.[^.]+$/, "") || "Candidate"} — Client Profile` : (filename || "CV Document")}
                </span>
                <span className="text-xs text-text-dim uppercase shrink-0 border border-border/50 px-1.5 py-0.5 rounded">
                  {modalMode === "client" ? "CLIENT PDF" : fileType === "pdf" ? "PDF" : fileType === "word" ? "WORD" : "FILE"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {/* Download button — downloads the blob currently shown */}
                {viewState === "ready" && (
                  <button
                    onClick={() =>
                      modalMode === "client"
                        ? handleDownloadBlob(clientCvName)
                        : fileType === "pdf"
                          ? handleDownloadBlob(filename || "cv.pdf")
                          : handleDownloadOriginal()
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                )}
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-hidden relative">
              {viewState === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-dim">
                  <div className="w-6 h-6 border-2 border-text-dim/20 border-t-text-dim rounded-full animate-spin" />
                  <span className="text-sm">
                    {modalMode === "client" ? "Generating client PDF..." : "Loading document..."}
                  </span>
                </div>
              )}

              {viewState === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                  <svg className="w-8 h-8 text-red-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-text-dim">{viewError || "Could not render this document."}</p>
                  {modalMode === "original" && (
                    <button onClick={handleDownloadOriginal} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Download instead
                    </button>
                  )}
                </div>
              )}

              {/* PDF blob preview (both original PDF and client CV) */}
              {viewState === "ready" && pdfBlobUrl && (
                <iframe src={pdfBlobUrl} className="w-full h-full border-0" title={modalMode === "client" ? "Client Profile" : (filename || "CV")} />
              )}

              {/* Word HTML preview */}
              {viewState === "ready" && fileType === "word" && wordHtml && !pdfBlobUrl && (
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                    * { box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; background: #fff; padding: 32px 40px; max-width: 860px; margin: 0 auto; }
                    h1,h2,h3,h4 { font-weight: 600; margin: 1.2em 0 0.4em; }
                    p { margin: 0.5em 0; }
                    table { border-collapse: collapse; width: 100%; }
                    td, th { padding: 4px 8px; vertical-align: top; }
                    ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
                    a { color: #2563eb; }
                  </style></head><body>${wordHtml}</body></html>`}
                  className="w-full h-full border-0 bg-white"
                  title={filename || "CV"}
                  sandbox="allow-same-origin"
                />
              )}

              {/* Unknown type fallback */}
              {viewState === "ready" && fileType === "unknown" && !pdfBlobUrl && !wordHtml && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
                  <p className="text-sm text-text-dim">Preview not available for this file type.</p>
                  <button onClick={handleDownloadOriginal} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download file
                  </button>
                </div>
              )}
            </div>

            {/* Parse error footer (original CV only) */}
            {parseError && modalMode === "original" && (
              <div className="px-5 py-2.5 border-t border-border bg-red-400/5 shrink-0">
                <p className="text-xs text-red-400"><span className="font-medium">Parse error:</span> {parseError}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
