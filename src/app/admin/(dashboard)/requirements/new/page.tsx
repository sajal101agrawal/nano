import { requireAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import NewRequirementForm from "./NewRequirementForm";
import Link from "next/link";
import type { Client } from "@/types";

export const metadata = { title: "New Requirement" };

export default async function NewRequirementPage() {
  await requireAdminSession();

  const clients = await query<Client>(
    "SELECT id, company_name FROM clients ORDER BY company_name ASC"
  );

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-text-dim mb-6">
        <Link href="/admin/requirements" className="hover:text-text-light transition-colors">
          Requirements
        </Link>
        <span className="text-text-dim/40">/</span>
        <span>New</span>
      </div>

      <div className="mb-7">
        <h1 className="font-display text-2xl font-bold text-text-light">
          New Requirement
        </h1>
        <p className="text-sm text-text-dim mt-1">
          Post a new job requirement. AI will extract skills, requirements, and match candidates automatically.
        </p>
      </div>

      <NewRequirementForm clients={clients} />
    </div>
  );
}
