"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { Requirement, RequirementQuestion, CandidateSession } from "@/types";

interface Props {
  requirement: Requirement;
  questions: RequirementQuestion[];
  session: CandidateSession;
}

type FlowStep = 1 | 2 | 3 | 4;

interface Answers {
  [questionId: string]: string | boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const MAX_SIZE = 10 * 1024 * 1024;

// ---- Progress dots ----
function ProgressDots({ current, total }: { current: FlowStep; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={`rounded-full transition-all duration-300 ${
            n === current
              ? "w-5 h-1.5 bg-blue-500"
              : n < current
              ? "w-1.5 h-1.5 bg-blue-500/40"
              : "w-1.5 h-1.5 bg-white/[0.1]"
          }`}
        />
      ))}
    </div>
  );
}

// ---- Step 1: Job Description ----
function JDStep({
  requirement,
  onNext,
}: {
  requirement: Requirement;
  onNext: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="font-display font-semibold text-[15px] text-white/60 mb-1">
          About this role
        </h2>
      </div>

      <div className="border border-white/[0.07] rounded-xl bg-white/[0.02] p-5 sm:p-6 mb-5 max-h-[55vh] overflow-y-auto">
        <div className="prose-custom">
          {requirement.jd_raw.split("\n").map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} className="h-3" />;
            if (trimmed.startsWith("##")) {
              return (
                <h3
                  key={i}
                  className="font-display font-semibold text-[15px] text-white/90 mt-4 mb-1.5 first:mt-0"
                >
                  {trimmed.replace(/^##\s*/, "")}
                </h3>
              );
            }
            if (trimmed.startsWith("#")) {
              return (
                <h2
                  key={i}
                  className="font-display font-semibold text-[16px] text-white mt-4 mb-2 first:mt-0"
                >
                  {trimmed.replace(/^#\s*/, "")}
                </h2>
              );
            }
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
              return (
                <div key={i} className="flex items-start gap-2 my-0.5">
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-blue-500/60 flex-shrink-0" />
                  <p className="text-[14px] text-white/55 leading-relaxed">
                    {trimmed.slice(2)}
                  </p>
                </div>
              );
            }
            return (
              <p key={i} className="text-[14px] text-white/55 leading-relaxed my-1">
                {line}
              </p>
            );
          })}
        </div>
      </div>

      {(requirement.required_skills?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {requirement.required_skills!.map((s) => (
            <span
              key={s}
              className="text-[12px] text-blue-400/70 bg-blue-500/[0.08] border border-blue-500/[0.15] rounded-full px-2.5 py-0.5"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-[14px] rounded-lg py-2.5 transition-colors"
      >
        Start Application
      </button>
    </div>
  );
}

// ---- Step 2: CV Upload ----
function CVStep({
  onNext,
  cvFile,
  onFileChange,
}: {
  onNext: () => void;
  cvFile: File | null;
  onFileChange: (f: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSet = (file: File) => {
    setFileError("");
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("Only PDF or DOCX files are accepted.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError("File is too large. Maximum size is 10 MB.");
      return;
    }
    onFileChange(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="font-display font-semibold text-[18px] text-white mb-1">
          Upload your CV
        </h2>
        <p className="text-[13px] text-white/40">
          PDF or DOCX, up to 10 MB
        </p>
      </div>

      <div
        onClick={() => !cvFile && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer mb-4 ${
          cvFile
            ? "border-blue-500/40 bg-blue-500/[0.05] cursor-default"
            : dragging
            ? "border-blue-500/60 bg-blue-500/[0.07]"
            : "border-white/[0.09] hover:border-white/[0.18] hover:bg-white/[0.02]"
        }`}
      >
        {cvFile ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-blue-400"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="text-left min-w-0">
                <p className="text-[13px] font-medium text-white truncate">{cvFile.name}</p>
                <p className="text-[11px] text-white/35">{formatFileSize(cvFile.size)}</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0 p-1"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-white/30"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-[14px] text-white/50 mb-1">
              {dragging ? "Drop it here" : "Drag & drop or click to upload"}
            </p>
            <p className="text-[12px] text-white/25">PDF, DOCX — max 10 MB</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleInputChange}
        className="hidden"
      />

      {fileError && (
        <p className="text-[13px] text-red-400 flex items-start gap-1.5 mb-3">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 flex-shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {fileError}
        </p>
      )}

      <button
        onClick={onNext}
        disabled={!cvFile}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-lg py-2.5 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}

// ---- Step 3: Questions ----
function QuestionsStep({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  submitting,
  submitError,
  candidateName,
  onNameChange,
  candidatePhone,
  onPhoneChange,
  sessionType,
}: {
  questions: RequirementQuestion[];
  answers: Answers;
  onAnswerChange: (id: string, value: string | boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
  candidateName: string;
  onNameChange: (v: string) => void;
  candidatePhone: string;
  onPhoneChange: (v: string) => void;
  sessionType: "email" | "phone";
}) {
  const [validationError, setValidationError] = useState("");

  const handleSubmit = () => {
    setValidationError("");
    if (!candidateName.trim()) {
      setValidationError("Please enter your name.");
      return;
    }
    for (const q of questions) {
      if (q.required) {
        const ans = answers[q.id];
        if (ans === undefined || ans === null || ans === "") {
          setValidationError(`Please answer: "${q.question_text}"`);
          return;
        }
      }
    }
    onSubmit();
  };

  const error = validationError || submitError;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="font-display font-semibold text-[18px] text-white mb-1">
          A few questions
        </h2>
        <p className="text-[13px] text-white/40">
          Help us understand your profile better.
        </p>
      </div>

      <div className="space-y-5">
        {/* Name always required */}
        <div>
          <label className="block text-[12px] font-medium text-white/50 mb-1.5">
            Your name <span className="text-red-400/70">*</span>
          </label>
          <input
            type="text"
            autoComplete="name"
            placeholder="Full name"
            value={candidateName}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.09] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] transition-all"
          />
        </div>

        {/* Phone optional if session is email */}
        {sessionType === "email" && (
          <div>
            <label className="block text-[12px] font-medium text-white/50 mb-1.5">
              Phone number <span className="text-white/25 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={candidatePhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.09] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] transition-all"
            />
          </div>
        )}

        {questions.map((q) => (
          <div key={q.id}>
            <label className="block text-[13px] font-medium text-white/70 mb-2">
              {q.question_text}
              {q.required && <span className="text-red-400/70 ml-1">*</span>}
            </label>

            {q.question_type === "boolean" && (
              <div className="flex gap-2">
                {["Yes", "No"].map((opt) => {
                  const val = opt === "Yes";
                  const selected = answers[q.id] === val;
                  return (
                    <button
                      key={opt}
                      onClick={() => onAnswerChange(q.id, val)}
                      className={`flex-1 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                        selected
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-400"
                          : "border-white/[0.09] bg-white/[0.03] text-white/50 hover:border-white/[0.18] hover:text-white/70"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {q.question_type === "select" && q.options && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onAnswerChange(q.id, opt.value)}
                      className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                        selected
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-400"
                          : "border-white/[0.09] bg-white/[0.03] text-white/50 hover:border-white/[0.18] hover:text-white/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {q.question_type === "text" && (
              <input
                type="text"
                placeholder="Your answer"
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                onChange={(e) => onAnswerChange(q.id, e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] transition-all"
              />
            )}

            {q.question_type === "multiselect" && q.options && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const current = typeof answers[q.id] === "string"
                    ? (answers[q.id] as string).split(",").filter(Boolean)
                    : [];
                  const selected = current.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const next = selected
                          ? current.filter((v) => v !== opt.value)
                          : [...current, opt.value];
                        onAnswerChange(q.id, next.join(","));
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                        selected
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-400"
                          : "border-white/[0.09] bg-white/[0.03] text-white/50 hover:border-white/[0.18] hover:text-white/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-[13px] text-red-400 flex items-start gap-1.5 mt-5">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 flex-shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-lg py-2.5 transition-colors mt-6"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="animate-spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Submitting&hellip;
          </span>
        ) : (
          "Submit Application"
        )}
      </button>
    </div>
  );
}

// ---- Step 4: Done ----
function DoneStep({ title }: { title: string }) {
  return (
    <div className="animate-fade-in text-center py-8">
      <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-emerald-400"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="font-display font-bold text-[22px] text-white mb-2">
        Application submitted!
      </h2>
      <p className="text-[14px] text-white/50 mb-1">
        You applied for <span className="text-white/70">{title}</span>
      </p>
      <p className="text-[13px] text-white/35 mb-8">
        We&apos;ll review your profile and reach out soon.
      </p>
      <Link
        href="/jobs"
        className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/25 rounded-lg px-4 py-2"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Browse more jobs
      </Link>
    </div>
  );
}

// ---- Upload progress bar ----
function UploadProgress({ progress }: { progress: number }) {
  return (
    <div className="border border-white/[0.07] rounded-xl bg-white/[0.02] p-5 mb-4">
      <div className="flex items-center justify-between text-[12px] text-white/40 mb-2">
        <span>Uploading CV&hellip;</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1 bg-white/[0.07] rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ---- Main component ----
export default function ApplicationFlow({ requirement, questions, session }: Props) {
  const [step, setStep] = useState<FlowStep>(1);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [candidateName, setCandidateName] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleAnswerChange = useCallback((id: string, value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleCVContinue = async () => {
    if (!cvFile) return;
    setUploading(true);
    setUploadProgress(0);

    // Fake smooth progress up to 85% while we wait
    const interval = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 85) { clearInterval(interval); return p; }
        return p + Math.random() * 8;
      });
    }, 200);

    // We don't upload here — we bundle with the final submit
    await new Promise((r) => setTimeout(r, 800));
    clearInterval(interval);
    setUploadProgress(100);
    await new Promise((r) => setTimeout(r, 300));
    setUploading(false);
    setUploadProgress(0);

    if (questions.length === 0) {
      // No questions — submit directly, only advance to done on success
      await handleFinalSubmit();
    } else {
      setStep(3);
    }
  };

  const handleFinalSubmit = async () => {
    if (!cvFile) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const formData = new FormData();
      formData.append("cvFile", cvFile);
      formData.append("requirementId", requirement.id);
      formData.append("answers", JSON.stringify(answers));
      if (candidateName.trim()) formData.append("candidateName", candidateName.trim());
      if (candidatePhone.trim()) formData.append("candidatePhone", candidatePhone.trim());

      const res = await fetch("/api/candidate/apply", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!data.success) {
        setSubmitError(data.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setStep(4);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 4;

  return (
    <div>
      <ProgressDots current={step} total={totalSteps} />

      {step === 1 && (
        <JDStep requirement={requirement} onNext={() => setStep(2)} />
      )}

      {step === 2 && (
        <>
          {uploading && <UploadProgress progress={uploadProgress} />}
          {!uploading && (
            <CVStep
              cvFile={cvFile}
              onFileChange={setCvFile}
              onNext={handleCVContinue}
            />
          )}
        </>
      )}

      {step === 3 && (
        <QuestionsStep
          questions={questions}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSubmit={handleFinalSubmit}
          submitting={submitting}
          submitError={submitError}
          candidateName={candidateName}
          onNameChange={setCandidateName}
          candidatePhone={candidatePhone}
          onPhoneChange={setCandidatePhone}
          sessionType={session.identifierType}
        />
      )}

      {step === 4 && <DoneStep title={requirement.title} />}
    </div>
  );
}
