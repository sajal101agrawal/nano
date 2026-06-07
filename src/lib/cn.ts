import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return formatDate(date);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trimEnd() + "…";
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function availabilityColor(status: string): string {
  switch (status) {
    case "available": return "text-emerald-500";
    case "unavailable": return "text-red-500";
    default: return "text-amber-500";
  }
}

export function availabilityBadgeClass(status: string): string {
  switch (status) {
    case "available": return "badge badge-green";
    case "unavailable": return "badge badge-red";
    default: return "badge badge-amber";
  }
}

export function applicationStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    applied: "badge badge-blue",
    parsing: "badge badge-blue",
    parsed: "badge badge-green",
    parse_failed: "badge badge-red",
    shortlisted: "badge badge-purple",
    contacted: "badge badge-purple",
    in_discussion: "badge badge-amber",
    offered: "badge badge-amber",
    placed: "badge badge-green",
    rejected: "badge badge-gray",
    withdrawn: "badge badge-gray",
  };
  return map[status] || "badge badge-gray";
}

export function requirementStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    open: "badge badge-green",
    on_hold: "badge badge-amber",
    filled: "badge badge-blue",
    closed: "badge badge-gray",
  };
  return map[status] || "badge badge-gray";
}
