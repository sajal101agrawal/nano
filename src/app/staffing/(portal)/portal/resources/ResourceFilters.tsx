"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

const AVAILABILITY_OPTIONS = [
  { value: "", label: "All availability" },
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
  { value: "unknown", label: "Unknown" },
];

export function ResourceFilters({
  initialSearch,
  initialAvailability,
}: {
  initialSearch: string;
  initialAvailability: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [availability, setAvailability] = useState(initialAvailability);
  const [isPending, startTransition] = useTransition();

  function apply() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (availability) p.set("availability", availability);
    startTransition(() => {
      router.push(`/staffing/portal/resources${p.toString() ? "?" + p.toString() : ""}`);
    });
  }

  function clear() {
    setSearch("");
    setAvailability("");
    startTransition(() => {
      router.push("/staffing/portal/resources");
    });
  }

  const hasFilters = search || availability;

  return (
    <div className="flex flex-wrap gap-2 items-center mb-5">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Search name, title, email..."
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
