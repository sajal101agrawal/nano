"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "candidates", label: "Job applicants" },
  { value: "staffing", label: "Staffing resources" },
];

const AVAILABILITY_OPTIONS = [
  { value: "", label: "All availability" },
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
  { value: "unknown", label: "Unknown" },
];

interface Props {
  initialQ?: string;
  initialAvailability?: string;
  initialSource?: string;
}

export default function PoolFilters({ initialQ, initialAvailability, initialSource }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ || "");
  const [availability, setAvailability] = useState(initialAvailability || "");
  const [source, setSource] = useState(initialSource || "all");
  const [isPending, startTransition] = useTransition();

  function apply() {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (availability) p.set("availability", availability);
    if (source && source !== "all") p.set("source", source);
    startTransition(() => {
      router.push(`/admin/pool${p.toString() ? "?" + p.toString() : ""}`);
    });
  }

  function clear() {
    setQ(""); setAvailability(""); setSource("all");
    startTransition(() => router.push("/admin/pool"));
  }

  const hasFilters = q || availability || source !== "all";

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Search name, email, skills..."
          className="input-base !pl-9 pr-4"
        />
      </div>

      <select
        value={availability}
        onChange={(e) => setAvailability(e.target.value)}
        className="input-base w-auto"
        style={{ minWidth: "140px" }}
      >
        {AVAILABILITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="input-base w-auto"
        style={{ minWidth: "150px" }}
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <button onClick={apply} className="btn btn-primary btn-sm" disabled={isPending}>
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>{isPending ? "..." : "Apply"}</span>
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
