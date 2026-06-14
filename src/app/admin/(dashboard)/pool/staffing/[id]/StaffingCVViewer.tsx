"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  resourceId: string;
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

export default function StaffingCVViewer({ resourceId, filename, parseStatus, parseError }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("original");
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [wordHtml, setWordHtml] = useState("");
  const [viewError, setViewError] = useState("");
  const [dlLoading, setDlLoading] = useState(false);
  const [dlError, setDlError] = useState("");
  const blobUrlRef = useRef("");
  const fileType = getFileType(filename);

  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, []);

  async function loadPreview(mode: ModalMode) {
    setModalOpen(true);
    setModalMode(mode);
    setViewState("loading");
    setViewError("");
    setPdfBlobUrl("");
    setWordHtml("");
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
    try {
      const url = mode === "client"
        ? `/api/admin/staffing/resources/${resourceId}/client-cv`
        : `/api/admin/staffing/resources/${resourceId}/cv-preview`;
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
  }

  function closeModal() {
    setModalOpen(false);
    setViewState("idle");
    setPdfBlobUrl("");
    setWordHtml("");
    setViewError("");
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
  }

  async function handleDownloadOriginal() {
    setDlLoading(true);
    setDlError("");
    try {
      const res = await fetch(`/api/admin/staffing/resources/${resourceId}/cv-url`);
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
  }

  function handleDownloadBlob(defaultName: string) {
    if (!blobUrlRef.current) return;
    const a = document.createElement("a");
    a.href = blobUrlRef.current;
    a.download = defaultName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const clientCvName = `${filename?.replace(/\.[^.]+$/, "") || "resource"}_ClientProfile.pdf`;

  return (
    <>
      <div className="space-y-2">
        <div className="flex gap-2">
          <button onClick={() => loadPreview("original")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors flex-1 justify-center">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview CV
          </button>
          <button onClick={handleDownloadOriginal} disabled={dlLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover disabled:opacity-50 transition-colors flex-1 justify-center">
            {dlLoading
              ? <div className="w-3.5 h-3.5 border-2 border-text-dim/30 border-t-text-dim rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
            {dlLoading ? "Downloading..." : "Download"}
          </button>
        </div>
        {dlError && <p className="text-red-400 text-xs">{dlError}</p>}
        <button onClick={() => loadPreview("client")} className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-1.5 text-sm font-medium rounded-lg border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Preview Client CV
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl h-[90vh] flex flex-col bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm font-medium text-text-light truncate">
                  {modalMode === "client" ? `${filename?.replace(/\.[^.]+$/, "") || "Resource"} — Client Profile` : (filename || "CV Document")}
                </span>
                <span className="text-xs text-text-dim uppercase shrink-0 border border-border/50 px-1.5 py-0.5 rounded">
                  {modalMode === "client" ? "CLIENT PDF" : fileType === "pdf" ? "PDF" : fileType === "word" ? "WORD" : "FILE"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {viewState === "ready" && (
                  <button
                    onClick={() => modalMode === "client" ? handleDownloadBlob(clientCvName) : fileType === "pdf" ? handleDownloadBlob(filename || "cv.pdf") : handleDownloadOriginal()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download
                  </button>
                )}
                <button onClick={closeModal} className="p-1.5 rounded-lg text-text-dim hover:text-text-light hover:bg-bg-hover transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
              {viewState === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-dim">
                  <div className="w-6 h-6 border-2 border-text-dim/20 border-t-text-dim rounded-full animate-spin" />
                  <span className="text-sm">{modalMode === "client" ? "Generating client PDF..." : "Loading document..."}</span>
                </div>
              )}
              {viewState === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                  <p className="text-sm text-text-dim">{viewError || "Could not render this document."}</p>
                  {modalMode === "original" && (
                    <button onClick={handleDownloadOriginal} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg text-text-light hover:bg-bg-hover transition-colors">
                      Download instead
                    </button>
                  )}
                </div>
              )}
              {viewState === "ready" && pdfBlobUrl && (
                <iframe src={pdfBlobUrl} className="w-full h-full border-0" title={modalMode === "client" ? "Client Profile" : (filename || "CV")} />
              )}
              {viewState === "ready" && fileType === "word" && wordHtml && !pdfBlobUrl && (
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;background:#fff;padding:32px 40px;max-width:860px;margin:0 auto}h1,h2,h3{font-weight:600;margin:1.2em 0 0.4em}p{margin:0.5em 0}ul,ol{padding-left:1.5em;margin:0.5em 0}</style></head><body>${wordHtml}</body></html>`}
                  className="w-full h-full border-0 bg-white"
                  title={filename || "CV"}
                  sandbox="allow-same-origin"
                />
              )}
            </div>
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
