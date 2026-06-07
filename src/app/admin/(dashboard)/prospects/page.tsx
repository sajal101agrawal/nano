import { query } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatRelativeTime } from "@/lib/cn";
import { ProspectSearch } from "./ProspectSearch";

export default async function ProspectsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const recentProspects = await query<{
    id: string;
    full_name: string;
    headline: string;
    current_company: string;
    email: string;
    email_status: string;
    provider: string;
    created_at: string;
  }>(
    `SELECT id, full_name, headline, current_company, email, email_status, provider, created_at
     FROM prospects WHERE do_not_contact = FALSE
     ORDER BY created_at DESC LIMIT 20`
  );

  const templates = await query<{ id: string; name: string }>(
    "SELECT id, name FROM templates WHERE template_type = 'candidate_outreach' ORDER BY name"
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-light">External Sourcing</h1>
        <p className="text-text-dim text-sm mt-1">
          Search and reach out to prospects via Apollo.io
        </p>
      </div>

      <ProspectSearch templates={templates} recentProspects={recentProspects} />
    </div>
  );
}
