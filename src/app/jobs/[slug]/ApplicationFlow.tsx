"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { Requirement, RequirementQuestion } from "@/types";

interface Props {
  requirement: Requirement;
  questions: RequirementQuestion[];
}

type FlowStep = "upload" | "details" | "preferences" | "questions" | "submitting" | "done";

interface ParsedInfo {
  full_name?: string;
  email?: string;
  phone?: string;
}

interface Answers {
  [questionId: string]: string | boolean;
}

interface CandidatePreferences {
  openTo: string[];
  noticePeriod: string;
  preferredLocations: string[];
  currentCtc: string;
  expectedCtc: string;
  expectedHourlyRate: string;
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

function StepIndicator({ current, steps }: { current: number; steps: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: steps }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-8 bg-primary"
              : i < current
              ? "w-5 bg-primary/50"
              : "w-5 bg-slate-200 dark:bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}

function UploadStep({
  cvFile,
  onFileChange,
  onContinue,
  parsing,
}: {
  cvFile: File | null;
  onFileChange: (f: File | null) => void;
  onContinue: () => void;
  parsing: boolean;
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

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-text-light tracking-tight mb-1.5">
          Upload your resume
        </h2>
        <p className="text-sm text-text-dim leading-relaxed">
          We will extract your details automatically. No account needed.
        </p>
      </div>

      <div
        onClick={() => !cvFile && !parsing && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl transition-all mb-4 ${
          parsing
            ? "border-primary/40 bg-primary/[0.03] cursor-wait p-6"
            : cvFile
            ? "border-primary/30 bg-primary/[0.03] cursor-default p-5"
            : dragging
            ? "border-primary/60 bg-primary/[0.05] cursor-pointer p-8"
            : "border-border hover:border-border-hover hover:bg-bg-hover cursor-pointer p-8"
        }`}
      >
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-light">Reading your resume...</p>
              <p className="text-xs text-text-muted mt-1">This takes just a moment</p>
            </div>
          </div>
        ) : cvFile ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-text-light truncate">{cvFile.name}</p>
                <p className="text-xs text-text-muted">{formatFileSize(cvFile.size)}</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-text-muted hover:text-text-dim transition-colors flex-shrink-0 p-1.5 rounded-md hover:bg-bg-hover"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-bg-secondary border border-border flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-sm text-text-dim font-medium mb-1">
              {dragging ? "Drop it here" : "Drag and drop your resume"}
            </p>
            <p className="text-xs text-text-muted">or click to browse — PDF or DOCX, max 10 MB</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) validateAndSet(file);
        }}
        className="hidden"
      />

      {fileError && (
        <p className="text-[13px] text-red-500 flex items-start gap-1.5 mb-4">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {fileError}
        </p>
      )}

      <button
        onClick={onContinue}
        disabled={!cvFile || parsing}
        className="btn btn-primary w-full"
        style={{ padding: "12px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
      >
        {parsing ? "Processing..." : "Continue"}
      </button>
    </div>
  );
}

function DetailsStep({
  parsedInfo,
  name,
  email,
  phone,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  onContinue,
  emailRequired,
  phoneRequired,
}: {
  parsedInfo: ParsedInfo;
  name: string;
  email: string;
  phone: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onContinue: () => void;
  emailRequired: boolean;
  phoneRequired: boolean;
}) {
  const [error, setError] = useState("");

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  const isValidPhone = (v: string) => {
    if (!v.trim()) return true; // optional
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  };

  const formatName = (v: string) => {
    return v
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => {
        if (w.length === 0) return "";
        if (/^(de|da|di|del|van|von|der|le|la|el|al|bin|bint)$/i.test(w)) return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  };

  const handleNameBlur = () => {
    if (name.trim()) {
      onNameChange(formatName(name.trim()));
    }
  };

  const handleEmailBlur = () => {
    if (email.trim()) {
      onEmailChange(email.trim().toLowerCase());
    }
  };

  const handlePhoneBlur = () => {
    if (!phone.trim()) return;
    const digits = phone.replace(/\D/g, "");
    // Auto-format Indian mobile numbers
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      onPhoneChange(`+91 ${digits.slice(0, 5)} ${digits.slice(5)}`);
    } else if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
      onPhoneChange(`+91 ${digits.slice(2, 7)} ${digits.slice(7)}`);
    } else if (digits.length === 10 && /^[2-9]/.test(digits)) {
      onPhoneChange(`+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
    } else if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits.slice(1))) {
      onPhoneChange(`+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`);
    }
  };

  const handleContinue = () => {
    setError("");
    if (!name.trim() || name.trim().split(/\s+/).length < 2) {
      setError("Please enter your full name (first and last).");
      return;
    }
    if (!email.trim() || !isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError("Please enter a valid phone number (7-15 digits).");
      return;
    }
    onContinue();
  };

  const emailValid = !email.trim() || isValidEmail(email);
  const phoneValid = !phone.trim() || isValidPhone(phone);

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-text-light tracking-tight mb-1.5">
          Confirm your details
        </h2>
        <p className="text-sm text-text-dim leading-relaxed">
          {parsedInfo.email || parsedInfo.phone
            ? "We extracted these from your resume. Please verify."
            : "We could not extract contact details from your resume. Please fill them in."}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-1.5">
            Full name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            autoComplete="name"
            placeholder="First and last name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={handleNameBlur}
            className="input-base"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-1.5">
            Email address <span className="text-red-400">*</span>
            {parsedInfo.email && (
              <span className="text-text-muted font-normal ml-1.5">(from resume)</span>
            )}
          </label>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            onBlur={handleEmailBlur}
            className={`input-base ${email.trim() && !emailValid ? "!border-red-400 focus:!border-red-400 focus:!shadow-[0_0_0_3px_rgba(239,68,68,0.15)]" : ""}`}
          />
          {email.trim() && !emailValid && (
            <p className="text-[11px] text-red-400 mt-1">Enter a valid email address</p>
          )}
        </div>

        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-1.5">
            Phone number
            <span className="text-text-muted font-normal ml-1.5">(optional)</span>
            {parsedInfo.phone && (
              <span className="text-text-muted font-normal ml-1">&mdash; from resume</span>
            )}
          </label>
          <input
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onBlur={handlePhoneBlur}
            className={`input-base ${phone.trim() && !phoneValid ? "!border-red-400 focus:!border-red-400 focus:!shadow-[0_0_0_3px_rgba(239,68,68,0.15)]" : ""}`}
          />
          {phone.trim() && !phoneValid && (
            <p className="text-[11px] text-red-400 mt-1">Enter a valid phone number</p>
          )}
          {phone.trim() && phoneValid && phone.includes("+") && (
            <p className="text-[11px] text-text-muted mt-1">Formatted with country code</p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[13px] text-red-500 flex items-start gap-1.5 mt-4">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}

      <button
        onClick={handleContinue}
        className="btn btn-primary w-full mt-6"
        style={{ padding: "12px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
      >
        Continue
      </button>
    </div>
  );
}

const ENGAGEMENT_OPTIONS = [
  { value: "fulltime", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "freelance", label: "Freelance" },
];

const NOTICE_PERIOD_OPTIONS = [
  { value: "immediate", label: "Immediately" },
  { value: "15days", label: "15 days" },
  { value: "30days", label: "30 days" },
  { value: "60days", label: "60 days" },
  { value: "90days", label: "90 days" },
  { value: "90plus", label: "90+ days" },
];

const LOCATION_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "bengaluru", label: "Bengaluru" },
  { value: "gurugram", label: "Gurugram" },
  { value: "hyderabad", label: "Hyderabad" },
  { value: "mumbai", label: "Mumbai" },
  { value: "pune", label: "Pune" },
  { value: "chennai", label: "Chennai" },
  { value: "noida", label: "Noida" },
];

function PreferencesStep({
  preferences,
  onPreferencesChange,
  onContinue,
  submitting,
  submitError,
}: {
  preferences: CandidatePreferences;
  onPreferencesChange: (p: CandidatePreferences) => void;
  onContinue: () => void;
  submitting: boolean;
  submitError: string;
}) {
  const [error, setError] = useState("");

  const toggleArrayValue = (arr: string[], value: string): string[] => {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  };

  const handleContinue = () => {
    setError("");
    if (preferences.openTo.length === 0) {
      setError("Please select at least one engagement type.");
      return;
    }
    if (!preferences.noticePeriod) {
      setError("Please select your notice period.");
      return;
    }
    if (preferences.preferredLocations.length === 0) {
      setError("Please select at least one preferred location.");
      return;
    }
    if (!preferences.currentCtc.trim()) {
      setError("Please enter your current / previous CTC.");
      return;
    }
    if (!preferences.expectedCtc.trim()) {
      setError("Please enter your expected CTC.");
      return;
    }
    if (
      (preferences.openTo.includes("contract") || preferences.openTo.includes("freelance")) &&
      !preferences.expectedHourlyRate.trim()
    ) {
      setError("Please enter your expected hourly rate.");
      return;
    }
    onContinue();
  };

  const formatCtcInput = (value: string): string => {
    const digits = value.replace(/[^\d.]/g, "");
    return digits;
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-text-light tracking-tight mb-1.5">
          Your preferences
        </h2>
        <p className="text-sm text-text-dim leading-relaxed">
          Help us match you with the right opportunity.
        </p>
      </div>

      <div className="space-y-6">
        {/* Open to */}
        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-2.5">
            I am open to <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ENGAGEMENT_OPTIONS.map((opt) => {
              const selected = preferences.openTo.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onPreferencesChange({
                      ...preferences,
                      openTo: toggleArrayValue(preferences.openTo, opt.value),
                    })
                  }
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                    selected
                      ? "border-primary bg-primary/[0.08] text-primary"
                      : "border-border bg-bg-secondary text-text-dim hover:border-border-hover hover:text-text-light"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                    selected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {selected && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notice period */}
        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-2.5">
            How soon can you start? <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {NOTICE_PERIOD_OPTIONS.map((opt) => {
              const selected = preferences.noticePeriod === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onPreferencesChange({ ...preferences, noticePeriod: opt.value })
                  }
                  className={`px-3.5 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                    selected
                      ? "border-primary bg-primary/[0.08] text-primary"
                      : "border-border bg-bg-secondary text-text-dim hover:border-border-hover hover:text-text-light"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preferred locations */}
        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-2.5">
            Preferred work location <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {LOCATION_OPTIONS.map((opt) => {
              const selected = preferences.preferredLocations.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onPreferencesChange({
                      ...preferences,
                      preferredLocations: toggleArrayValue(preferences.preferredLocations, opt.value),
                    })
                  }
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                    selected
                      ? "border-primary bg-primary/[0.08] text-primary"
                      : "border-border bg-bg-secondary text-text-dim hover:border-border-hover hover:text-text-light"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                    selected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {selected && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current CTC */}
        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-1.5">
            Current / previous annual CTC <span className="text-red-400">*</span>
            <span className="text-text-muted font-normal ml-1.5">(in lakhs)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-text-muted pointer-events-none font-medium">INR</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 12.5"
              value={preferences.currentCtc}
              onChange={(e) =>
                onPreferencesChange({ ...preferences, currentCtc: formatCtcInput(e.target.value) })
              }
              className="input-base"
              style={{ paddingLeft: "52px", paddingRight: "44px" }}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-text-muted pointer-events-none">LPA</span>
          </div>
        </div>

        {/* Expected CTC */}
        <div>
          <label className="block text-[12px] font-medium text-text-dim mb-1.5">
            Expected annual CTC <span className="text-red-400">*</span>
            <span className="text-text-muted font-normal ml-1.5">(in lakhs)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-text-muted pointer-events-none font-medium">INR</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 18"
              value={preferences.expectedCtc}
              onChange={(e) =>
                onPreferencesChange({ ...preferences, expectedCtc: formatCtcInput(e.target.value) })
              }
              className="input-base"
              style={{ paddingLeft: "52px", paddingRight: "44px" }}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-text-muted pointer-events-none">LPA</span>
          </div>
        </div>

        {/* Expected hourly rate - only when contract or freelance selected */}
        {(preferences.openTo.includes("contract") || preferences.openTo.includes("freelance")) && (
          <div>
            <label className="block text-[12px] font-medium text-text-dim mb-1.5">
              Expected hourly rate <span className="text-red-400">*</span>
              <span className="text-text-muted font-normal ml-1.5">(for contract/freelance)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-text-muted pointer-events-none font-medium">INR</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 2500"
                value={preferences.expectedHourlyRate}
                onChange={(e) =>
                  onPreferencesChange({ ...preferences, expectedHourlyRate: formatCtcInput(e.target.value) })
                }
                className="input-base"
                style={{ paddingLeft: "52px", paddingRight: "36px" }}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-text-muted pointer-events-none">/hr</span>
            </div>
          </div>
        )}
      </div>

      {(error || submitError) && (
        <p className="text-[13px] text-red-500 flex items-start gap-1.5 mt-5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error || submitError}
        </p>
      )}

      <button
        onClick={handleContinue}
        disabled={submitting}
        className="btn btn-primary w-full mt-6"
        style={{ padding: "12px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Submitting...
          </span>
        ) : (
          "Submit Application"
        )}
      </button>
    </div>
  );
}

function QuestionsStep({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  submitting,
  submitError,
}: {
  questions: RequirementQuestion[];
  answers: Answers;
  onAnswerChange: (id: string, value: string | boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
}) {
  const [validationError, setValidationError] = useState("");

  const handleSubmit = () => {
    setValidationError("");
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
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-text-light tracking-tight mb-1.5">
          A few quick questions
        </h2>
        <p className="text-sm text-text-dim leading-relaxed">
          Help us understand your fit for this role.
        </p>
      </div>

      <div className="space-y-5">
        {questions.map((q) => (
          <div key={q.id}>
            <label className="block text-[13px] font-medium text-text-dim mb-2">
              {q.question_text}
              {q.required && <span className="text-red-400 ml-1">*</span>}
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
                      className={`flex-1 py-2.5 rounded-lg text-[13px] font-medium border transition-all ${
                        selected
                          ? "border-primary bg-primary/[0.08] text-primary"
                          : "border-border bg-bg-secondary text-text-dim hover:border-border-hover hover:text-text-light"
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
                      className={`px-3.5 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                        selected
                          ? "border-primary bg-primary/[0.08] text-primary"
                          : "border-border bg-bg-secondary text-text-dim hover:border-border-hover hover:text-text-light"
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
                className="input-base"
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
                      className={`px-3.5 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                        selected
                          ? "border-primary bg-primary/[0.08] text-primary"
                          : "border-border bg-bg-secondary text-text-dim hover:border-border-hover hover:text-text-light"
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
        <p className="text-[13px] text-red-500 flex items-start gap-1.5 mt-5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
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
        className="btn btn-primary w-full mt-6"
        style={{ padding: "12px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Submitting...
          </span>
        ) : (
          "Submit Application"
        )}
      </button>
    </div>
  );
}

function DoneStep({ title }: { title: string }) {
  return (
    <div className="animate-fade-up text-center py-10">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="font-display text-2xl font-bold text-text-light tracking-tight mb-2">
        Application submitted
      </h2>
      <p className="text-sm text-text-dim mb-1.5 max-w-sm mx-auto">
        You applied for <span className="font-medium text-text-light">{title}</span>
      </p>
      <p className="text-[13px] text-text-muted mb-8 max-w-sm mx-auto">
        We will review your profile and get back to you via email. Keep an eye on your inbox.
      </p>
      <Link
        href="/jobs"
        className="btn btn-secondary inline-flex items-center gap-2"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Browse more positions
      </Link>
    </div>
  );
}

export default function ApplicationFlow({ requirement, questions }: Props) {
  const [step, setStep] = useState<FlowStep>("upload");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<ParsedInfo>({});
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [preferences, setPreferences] = useState<CandidatePreferences>({
    openTo: [],
    noticePeriod: "",
    preferredLocations: [],
    currentCtc: "",
    expectedCtc: "",
    expectedHourlyRate: "",
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleAnswerChange = useCallback((id: string, value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleUploadContinue = async () => {
    if (!cvFile) return;
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append("cvFile", cvFile);

      const res = await fetch("/api/candidate/parse-cv", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.parsed) {
          const parsed = data.parsed as ParsedInfo;
          setParsedInfo(parsed);
          if (parsed.full_name) setCandidateName(parsed.full_name);
          if (parsed.email) setCandidateEmail(parsed.email);
          if (parsed.phone) setCandidatePhone(parsed.phone);
        }
      }
    } catch {
      // Parsing failed silently - user will fill manually
    }

    setParsing(false);
    setStep("details");
  };

  const handleDetailsContinue = () => {
    setStep("preferences");
  };

  const handlePreferencesContinue = () => {
    handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    if (!cvFile) return;
    setSubmitting(true);
    setSubmitError("");
    setStep("submitting");

    try {
      const formData = new FormData();
      formData.append("cvFile", cvFile);
      formData.append("requirementId", requirement.id);
      formData.append("answers", JSON.stringify(answers));
      formData.append("candidateName", candidateName.trim());
      formData.append("candidateEmail", candidateEmail.trim());
      if (candidatePhone.trim()) formData.append("candidatePhone", candidatePhone.trim());
      formData.append("preferences", JSON.stringify(preferences));

      const res = await fetch("/api/candidate/apply", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!data.success) {
        setSubmitError(data.error || "Submission failed. Please try again.");
        setStep("preferences");
        setSubmitting(false);
        return;
      }

      setStep("done");
    } catch {
      setSubmitError("Network error. Please try again.");
      setStep("preferences");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 3;
  const currentStepIndex =
    step === "upload" ? 0
    : step === "details" ? 1
    : step === "preferences" ? 2
    : step === "submitting" ? 2
    : 0;

  return (
    <div className="max-w-lg">
      {step !== "done" && step !== "submitting" && (
        <StepIndicator current={currentStepIndex} steps={totalSteps} />
      )}

      {step === "upload" && (
        <UploadStep
          cvFile={cvFile}
          onFileChange={setCvFile}
          onContinue={handleUploadContinue}
          parsing={parsing}
        />
      )}

      {step === "details" && (
        <DetailsStep
          parsedInfo={parsedInfo}
          name={candidateName}
          email={candidateEmail}
          phone={candidatePhone}
          onNameChange={setCandidateName}
          onEmailChange={setCandidateEmail}
          onPhoneChange={setCandidatePhone}
          onContinue={handleDetailsContinue}
          emailRequired={!parsedInfo.email}
          phoneRequired={!parsedInfo.phone}
        />
      )}

      {step === "preferences" && (
        <PreferencesStep
          preferences={preferences}
          onPreferencesChange={setPreferences}
          onContinue={handlePreferencesContinue}
          submitting={submitting}
          submitError={submitError}
        />
      )}

      {step === "submitting" && (
        <div className="animate-fade-up text-center py-12">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-light">Submitting your application...</p>
          <p className="text-xs text-text-muted mt-1">Almost done</p>
        </div>
      )}

      {step === "done" && <DoneStep title={requirement.title} />}
    </div>
  );
}
