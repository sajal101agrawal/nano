"use client";
import { useState } from "react";
import { Search, Mail, User, Building2, MapPin, ExternalLink } from "lucide-react";
import { formatRelativeTime } from "@/lib/cn";

interface Prospect {
  id: string;
  full_name?: string;
  headline?: string;
  current_company?: string;
  location?: string;
  public_profile_url?: string;
  email?: string;
  email_status?: string;
  summary?: string;
  provider: string;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
}

interface Props {
  templates: Template[];
  recentProspects: Prospect[];
}

export function ProspectSearch({ templates, recentProspects }: Props) {
  const [searchParams, setSearchParams] = useState({
    skills: "",
    title: "",
    location: "",
    seniority: "",
  });
  const [results, setResults] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [findingEmail, setFindingEmail] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchParams.skills && !searchParams.title) {
      setError("Enter at least a skill or title to search");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/prospects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchParams),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
      } else {
        setResults(data.prospects || []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function findEmail(prospectId: string) {
    setFindingEmail(prospectId);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/enrich`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.email) {
        setResults((prev) =>
          prev.map((p) =>
            p.id === prospectId
              ? { ...p, email: data.email, email_status: data.email_status }
              : p
          )
        );
      }
    } catch {
      // silent
    } finally {
      setFindingEmail(null);
    }
  }

  const displayProspects = results.length > 0 ? results : recentProspects;
  const showingRecent = results.length === 0;

  return (
    <div className="space-y-6">
      {/* Search form */}
      <div className="bg-bg-secondary border border-border rounded-xl p-5">
        <h2 className="font-display font-semibold text-text-light mb-4">Search Prospects</h2>
        <form onSubmit={handleSearch} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-text-dim mb-1">Skills</label>
            <input
              value={searchParams.skills}
              onChange={(e) => setSearchParams((p) => ({ ...p, skills: e.target.value }))}
              placeholder="React, TypeScript..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-light placeholder:text-text-dim focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-text-dim mb-1">Title</label>
            <input
              value={searchParams.title}
              onChange={(e) => setSearchParams((p) => ({ ...p, title: e.target.value }))}
              placeholder="Senior Engineer..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-light placeholder:text-text-dim focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-text-dim mb-1">Location</label>
            <input
              value={searchParams.location}
              onChange={(e) => setSearchParams((p) => ({ ...p, location: e.target.value }))}
              placeholder="London, Remote..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-light placeholder:text-text-dim focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-text-dim mb-1">Seniority</label>
            <select
              value={searchParams.seniority}
              onChange={(e) => setSearchParams((p) => ({ ...p, seniority: e.target.value }))}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-light focus:outline-none focus:border-primary"
            >
              <option value="">Any</option>
              <option value="senior">Senior</option>
              <option value="mid">Mid-level</option>
              <option value="junior">Junior</option>
              <option value="lead">Lead / Principal</option>
              <option value="director">Director+</option>
            </select>
          </div>
          <div className="col-span-2 lg:col-span-4">
            {error && (
              <p className="text-sm text-red-400 mb-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      <div>
        <h2 className="font-display font-semibold text-text-light mb-3">
          {showingRecent ? "Recent Prospects" : `${results.length} Results`}
        </h2>
        <div className="space-y-3">
          {displayProspects.length === 0 ? (
            <div className="bg-bg-secondary border border-border rounded-xl p-8 text-center text-text-dim text-sm">
              No prospects found. Search above to find candidates.
            </div>
          ) : (
            displayProspects.map((prospect) => (
              <div
                key={prospect.id}
                className="bg-bg-secondary border border-border rounded-xl p-4 hover:border-border-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-light">
                        {prospect.full_name || "Unknown"}
                      </span>
                      {prospect.public_profile_url && (
                        <a
                          href={prospect.public_profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-dim hover:text-primary"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <span className="badge badge-gray text-xs">{prospect.provider}</span>
                    </div>
                    {prospect.headline && (
                      <p className="text-sm text-text-dim mt-0.5">{prospect.headline}</p>
                    )}
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      {prospect.current_company && (
                        <span className="flex items-center gap-1 text-xs text-text-dim">
                          <Building2 className="w-3 h-3" />
                          {prospect.current_company}
                        </span>
                      )}
                      {prospect.location && (
                        <span className="flex items-center gap-1 text-xs text-text-dim">
                          <MapPin className="w-3 h-3" />
                          {prospect.location}
                        </span>
                      )}
                    </div>
                    {prospect.summary && (
                      <p className="text-xs text-text-dim mt-2 line-clamp-2">{prospect.summary}</p>
                    )}
                    {prospect.email && (
                      <div className="flex items-center gap-2 mt-2">
                        <Mail className="w-3 h-3 text-text-dim" />
                        <span className="text-xs text-text-light">{prospect.email}</span>
                        {prospect.email_status && (
                          <span className={`badge text-xs ${prospect.email_status === "found" ? "badge-green" : "badge-amber"}`}>
                            {prospect.email_status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {!prospect.email && (
                      <button
                        onClick={() => findEmail(prospect.id)}
                        disabled={findingEmail === prospect.id}
                        className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-bg-hover transition-colors disabled:opacity-50 text-text-light"
                      >
                        {findingEmail === prospect.id ? "Finding..." : "Find Email"}
                      </button>
                    )}
                    {prospect.email && (
                      <a
                        href={`/admin/email/compose?prospectId=${prospect.id}`}
                        className="text-xs px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors text-center"
                      >
                        Send Email
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
