"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Client, Requirement } from "@/types";

type ScreeningQuestion = {
  id: string;
  question_text: string;
  question_type: "text" | "select" | "boolean" | "multiselect";
  options?: { value: string; label: string }[];
  required: boolean;
  sort_order: number;
};

const DEFAULT_QUESTIONS: ScreeningQuestion[] = [
  {
    id: "dq1",
    question_text: "Are you open to contract/freelance arrangements?",
    question_type: "boolean",
    required: true,
    sort_order: 1,
  },
  {
    id: "dq2",
    question_text: "What is your current notice period?",
    question_type: "select",
    options: [
      { value: "immediate", label: "Immediate" },
      { value: "15_days", label: "15 days" },
      { value: "30_days", label: "30 days" },
      { value: "60_days", label: "60 days" },
      { value: "90_days", label: "90 days" },
      { value: "other", label: "Other" },
    ],
    required: true,
    sort_order: 2,
  },
  {
    id: "dq3",
    question_text: "What is your location / remote preference?",
    question_type: "text",
    required: true,
    sort_order: 3,
  },
  {
    id: "dq4",
    question_text: "What is your expected rate? (optional)",
    question_type: "text",
    required: false,
    sort_order: 4,
  },
];

function generateId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

type EngagementType = "contract" | "fulltime" | "both";
type WorkMode = "remote" | "onsite" | "hybrid" | "flexible" | "";
type BudgetPeriod = "hourly" | "daily" | "monthly" | "annual";

function RadioPill({
  value,
  current,
  onChange,
  children,
}: {
  value: string;
  current: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "px-3.5 py-2 rounded-lg border text-sm font-medium transition-all",
        value === current
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-text-dim hover:border-border-hover hover:text-text-light hover:bg-bg-hover"
      )}
    >
      {children}
    </button>
  );
}

export default function NewRequirementForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const newQRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [jdRaw, setJdRaw] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [engagementType, setEngagementType] = useState<EngagementType>("both");
  const [workMode, setWorkMode] = useState<WorkMode>("");
  const [location, setLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("INR");
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>("monthly");
  const [questions, setQuestions] = useState<ScreeningQuestion[]>(DEFAULT_QUESTIONS);
  const [newQuestion, setNewQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addQuestion = useCallback(() => {
    if (!newQuestion.trim()) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: generateId(),
        question_text: newQuestion.trim(),
        question_type: "text",
        required: false,
        sort_order: prev.length + 1,
      },
    ]);
    setNewQuestion("");
    newQRef.current?.focus();
  }, [newQuestion]);

  const removeQuestion = useCallback((id: string) => {
    setQuestions((prev) =>
      prev.filter((q) => q.id !== id).map((q, i) => ({ ...q, sort_order: i + 1 }))
    );
  }, []);

  const moveQuestion = useCallback((id: string, dir: "up" | "down") => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((q, i) => ({ ...q, sort_order: i + 1 }));
    });
  }, []);

  const toggleRequired = useCallback((id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, required: !q.required } : q))
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    if (!jdRaw.trim()) { setError("Job description is required"); return; }
    if (isNewClient && !newClientName.trim()) { setError("Client name is required"); return; }

    setLoading(true);
    setError(null);

    try {
      let resolvedClientId = clientId;

      if (isNewClient && newClientName.trim()) {
        const clientRes = await fetch("/api/admin/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: newClientName.trim() }),
        });
        if (clientRes.ok) {
          const clientData = await clientRes.json() as { success: boolean; data: { id: string } };
          if (clientData.success) resolvedClientId = clientData.data.id;
        }
      }

      const payload = {
        title: title.trim(),
        jd_raw: jdRaw.trim(),
        client_id: resolvedClientId || undefined,
        engagement_type: engagementType,
        work_mode: workMode || undefined,
        location: location.trim() || undefined,
        budget_min: budgetMin ? parseFloat(budgetMin) : undefined,
        budget_max: budgetMax ? parseFloat(budgetMax) : undefined,
        budget_currency: budgetCurrency,
        budget_period: budgetPeriod,
        screening_questions: questions,
      };

      const res = await fetch("/api/admin/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json() as { success: boolean; data?: Requirement; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create requirement");

      router.push(`/admin/requirements/${data.data!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const inputClass = "input-base w-full";
  const selectClass = cn(inputClass, "cursor-pointer appearance-none");
  const labelClass = "block text-sm font-medium text-text-light mb-1.5";

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column — main fields */}
        <div className="lg:col-span-3 space-y-5">
          {/* Basic info */}
          <div className="card p-5 space-y-4">
            <h2 className="font-display font-semibold text-text-light">Basic Information</h2>

            <div>
              <label className={labelClass}>
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior React Developer"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Client</label>
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => { setIsNewClient(false); setNewClientName(""); }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg border transition-all",
                    !isNewClient
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-text-dim hover:bg-bg-hover"
                  )}
                >
                  Existing client
                </button>
                <button
                  type="button"
                  onClick={() => { setIsNewClient(true); setClientId(""); }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg border transition-all",
                    isNewClient
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-text-dim hover:bg-bg-hover"
                  )}
                >
                  New client
                </button>
              </div>
              {isNewClient ? (
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className={inputClass}
                />
              ) : (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">No client / Internal</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Job description */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-text-light">
                Job Description <span className="text-red-500">*</span>
              </h2>
              {jdRaw.length > 0 && (
                <span className="text-xs text-text-dim tabular-nums">
                  {jdRaw.length.toLocaleString()} chars
                </span>
              )}
            </div>
            <textarea
              value={jdRaw}
              onChange={(e) => setJdRaw(e.target.value)}
              placeholder="Paste the full job description here. AI will extract skills, requirements, and other details automatically."
              rows={18}
              className={cn(
                "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text-light placeholder:text-text-dim",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "hover:border-border-hover transition-colors resize-y font-mono leading-relaxed"
              )}
              required
            />
            <p className="text-xs text-text-dim">
              AI will parse this and extract required skills, experience level, and other metadata.
            </p>
          </div>
        </div>

        {/* Right column — settings */}
        <div className="lg:col-span-2 space-y-5">
          {/* Engagement type */}
          <div className="card p-5 space-y-4">
            <h2 className="font-display font-semibold text-text-light">Role Settings</h2>

            <div>
              <label className="block text-xs font-medium text-text-dim uppercase tracking-wide mb-2.5">
                Engagement Type
              </label>
              <div className="flex flex-wrap gap-2">
                <RadioPill value="both" current={engagementType} onChange={(v) => setEngagementType(v as EngagementType)}>
                  Both
                </RadioPill>
                <RadioPill value="contract" current={engagementType} onChange={(v) => setEngagementType(v as EngagementType)}>
                  Contract
                </RadioPill>
                <RadioPill value="fulltime" current={engagementType} onChange={(v) => setEngagementType(v as EngagementType)}>
                  Full-time
                </RadioPill>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-dim uppercase tracking-wide mb-2.5">
                Work Mode
              </label>
              <div className="flex flex-wrap gap-2">
                {(["", "remote", "onsite", "hybrid", "flexible"] as WorkMode[]).map((m) => (
                  <RadioPill key={m} value={m} current={workMode} onChange={(v) => setWorkMode(v as WorkMode)}>
                    {m ? m.charAt(0).toUpperCase() + m.slice(1) : "Any"}
                  </RadioPill>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bangalore / Pan-India"
                className={inputClass}
              />
            </div>
          </div>

          {/* Budget */}
          <div className="card p-5 space-y-4">
            <h2 className="font-display font-semibold text-text-light">Budget</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Currency</label>
                <select
                  value={budgetCurrency}
                  onChange={(e) => setBudgetCurrency(e.target.value)}
                  className={selectClass}
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AED">AED</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Period</label>
                <select
                  value={budgetPeriod}
                  onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriod)}
                  className={selectClass}
                >
                  <option value="hourly">Per hour</option>
                  <option value="daily">Per day</option>
                  <option value="monthly">Per month</option>
                  <option value="annual">Per year</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Min</label>
                <input
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="0"
                  min={0}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Max</label>
                <input
                  type="number"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="0"
                  min={0}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Screening questions */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-text-light">
                Screening Questions
              </h2>
              <span className="badge badge-gray">{questions.length}</span>
            </div>

            <div className="space-y-2">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="group flex items-start gap-2 rounded-lg border border-border bg-bg p-3 hover:border-border-hover transition-colors"
                >
                  <span className="text-xs text-text-dim/50 w-4 shrink-0 mt-0.5 text-right tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-light leading-snug">{q.question_text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-text-dim capitalize bg-bg-hover px-1.5 py-0.5 rounded">
                        {q.question_type}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleRequired(q.id)}
                        className={cn(
                          "text-[10px] font-medium transition-colors",
                          q.required ? "text-amber-500 hover:text-amber-400" : "text-text-dim hover:text-text-light"
                        )}
                      >
                        {q.required ? "Required" : "Optional"}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={() => moveQuestion(q.id, "up")}
                      disabled={idx === 0}
                      className="p-1 rounded text-text-dim hover:text-text-light hover:bg-bg-hover disabled:opacity-20 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(q.id, "down")}
                      disabled={idx === questions.length - 1}
                      className="p-1 rounded text-text-dim hover:text-text-light hover:bg-bg-hover disabled:opacity-20 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="p-1 rounded text-text-dim hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add custom question */}
            <div className="flex gap-2">
              <input
                ref={newQRef}
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addQuestion(); }
                }}
                placeholder="Add a custom question..."
                className={cn(inputClass, "flex-1 text-sm")}
              />
              <button
                type="button"
                onClick={addQuestion}
                disabled={!newQuestion.trim()}
                className="btn btn-secondary btn-sm shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3.5 flex items-start gap-3">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Sticky submit bar */}
      <div className="mt-6 flex items-center gap-3 pt-5 border-t border-border">
        <button
          type="submit"
          disabled={loading}
          className={cn(
            "btn btn-primary h-11 px-8 text-sm font-semibold flex items-center gap-2.5",
            loading && "opacity-70 cursor-not-allowed"
          )}
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Requirement
            </>
          )}
        </button>
        <a
          href="/admin/requirements"
          className="btn btn-secondary h-11 px-6 text-sm"
        >
          Cancel
        </a>
        <p className="ml-auto text-xs text-text-dim hidden sm:block">
          AI matching will run automatically after creation
        </p>
      </div>
    </form>
  );
}
