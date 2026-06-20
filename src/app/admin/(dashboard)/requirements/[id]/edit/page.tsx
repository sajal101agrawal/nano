import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import Link from "next/link";
import NewRequirementForm from "../../new/NewRequirementForm";
import type { Client, Requirement, RequirementQuestion } from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await queryOne<{ title: string }>(
    "SELECT title FROM requirements WHERE id = $1",
    [id]
  );
  return { title: req ? `Edit ${req.title} — Nano` : "Edit Requirement" };
}

export default async function EditRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminSession();

  const requirement = await queryOne<Requirement & { client_name?: string }>(
    `SELECT r.*, c.company_name AS client_name
     FROM requirements r
     LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.id = $1`,
    [id]
  );

  if (!requirement) notFound();

  const [clients, questions] = await Promise.all([
    query<Client>("SELECT id, company_name FROM clients ORDER BY company_name ASC"),
    query<RequirementQuestion>(
      "SELECT * FROM requirement_questions WHERE requirement_id = $1 ORDER BY sort_order",
      [id]
    ),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-1.5 text-xs text-text-dim mb-6">
        <Link href="/admin/requirements" className="hover:text-text-light transition-colors">
          Requirements
        </Link>
        <span className="text-text-dim/40">/</span>
        <Link href={`/admin/requirements/${id}`} className="hover:text-text-light transition-colors truncate max-w-xs">
          {requirement.title}
        </Link>
        <span className="text-text-dim/40">/</span>
        <span>Edit</span>
      </div>

      <div className="mb-7">
        <h1 className="font-display text-2xl font-bold text-text-light">
          Edit Requirement
        </h1>
        <p className="text-sm text-text-dim mt-1">
          Update job details and screening questions. Changes to the job description will re-run AI parsing.
        </p>
      </div>

      <NewRequirementForm
        clients={clients}
        requirement={requirement}
        initialQuestions={questions}
      />
    </div>
  );
}
