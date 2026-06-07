"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";

interface Props {
  initialQ?: string;
  initialAvailability?: string;
  initialContract?: boolean;
  initialMinExp?: string;
}

export default function CandidateFilters({ initialQ, initialAvailability, initialContract, initialMinExp }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ || "");
  const [availability, setAvailability] = useState(initialAvailability || "");
  const [contract, setContract] = useState(initialContract || false);
  const [minExp, setMinExp] = useState(initialMinExp || "");
  const [isPending, startTransition] = useTransition();

  function apply(overrides?: Partial<typeof initialQ>) {
    const params = new URLSearchParams();
    const qVal = typeof overrides === "string" ? overrides : q;
    if (qVal) params.set("q", qVal);
    if (availability) params.set("availability", availability);
    if (contract) params.set("contract", "true");
    if (minExp) params.set("min_experience", minExp);
    startTransition(() => {
      router.push(`/admin/candidates${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  function clear() {
    setQ(""); setAvailability(""); setContract(false); setMinExp("");
    startTransition(() => router.push("/admin/candidates"));
  }

  const hasFilters = q || availability || contract || minExp;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Search name, email, skills…"
          className="input-base pl-9 pr-4"
        />
      </div>

      {/* Availability */}
      <select
        value={availability}
        onChange={(e) => { setAvailability(e.target.value); }}
        className="input-base w-auto"
        style={{ minWidth: "140px" }}
      >
        <option value="">All availability</option>
        <option value="available">Available</option>
        <option value="unavailable">Unavailable</option>
        <option value="unknown">Unknown</option>
      </select>

      {/* Min experience */}
      <input
        type="number"
        value={minExp}
        onChange={(e) => setMinExp(e.target.value)}
        placeholder="Min exp (yrs)"
        min="0"
        max="30"
        className="input-base w-32"
      />

      {/* Contract toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div
          onClick={() => setContract(!contract)}
          className={[
            "w-9 h-5 rounded-full relative transition-colors cursor-pointer",
            contract ? "bg-primary" : "bg-border",
          ].join(" ")}
        >
          <div className={[
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
            contract ? "left-4.5" : "left-0.5",
          ].join(" ")} />
        </div>
        <span className="text-sm text-text-dim">Contract only</span>
      </label>

      {/* Apply / Clear */}
      <button onClick={() => apply()} className="btn btn-primary btn-sm" disabled={isPending}>
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>{isPending ? "…" : "Apply"}</span>
      </button>

      {hasFilters && (
        <button onClick={clear} className="btn btn-ghost btn-sm text-text-muted gap-1">
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
