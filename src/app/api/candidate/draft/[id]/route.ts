import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: PageProps) {
  const { id } = await params;

  if (!id || id.length < 30) {
    return NextResponse.json({ success: false, error: "Invalid draft ID" }, { status: 400 });
  }

  const draft = await queryOne<{
    id: string;
    requirement_id: string;
    cv_filename: string;
    cv_size_bytes: number;
    parsed_name: string | null;
    parsed_email: string | null;
    parsed_phone: string | null;
    candidate_name: string | null;
    candidate_email: string | null;
    candidate_phone: string | null;
    preferences: Record<string, unknown> | null;
    step: string;
    status: string;
    created_at: string;
  }>(
    `SELECT id, requirement_id, cv_filename, cv_size_bytes,
            parsed_name, parsed_email, parsed_phone,
            candidate_name, candidate_email, candidate_phone,
            preferences, step, status, created_at
     FROM draft_applications WHERE id = $1`,
    [id]
  );

  if (!draft) {
    return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
  }

  if (draft.status === "expired") {
    return NextResponse.json({ success: false, error: "This draft has expired" }, { status: 410 });
  }

  if (draft.status === "completed") {
    return NextResponse.json({ success: false, error: "This application has already been submitted" }, { status: 410 });
  }

  return NextResponse.json({
    success: true,
    draft: {
      id: draft.id,
      requirementId: draft.requirement_id,
      cvFilename: draft.cv_filename,
      cvSizeBytes: draft.cv_size_bytes,
      parsedName: draft.parsed_name,
      parsedEmail: draft.parsed_email,
      parsedPhone: draft.parsed_phone,
      candidateName: draft.candidate_name,
      candidateEmail: draft.candidate_email,
      candidatePhone: draft.candidate_phone,
      preferences: draft.preferences,
      step: draft.step,
      createdAt: draft.created_at,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: PageProps) {
  const { id } = await params;

  if (!id || id.length < 30) {
    return NextResponse.json({ success: false, error: "Invalid draft ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const draft = await queryOne<{ id: string; status: string }>(
    "SELECT id, status FROM draft_applications WHERE id = $1",
    [id]
  );

  if (!draft || draft.status !== "draft") {
    return NextResponse.json({ success: false, error: "Draft not found or already completed" }, { status: 404 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (body.candidateName !== undefined) {
    updates.push(`candidate_name = $${paramIdx++}`);
    values.push(body.candidateName);
  }
  if (body.candidateEmail !== undefined) {
    updates.push(`candidate_email = $${paramIdx++}`);
    values.push(body.candidateEmail);
  }
  if (body.candidatePhone !== undefined) {
    updates.push(`candidate_phone = $${paramIdx++}`);
    values.push(body.candidatePhone);
  }
  if (body.preferences !== undefined) {
    updates.push(`preferences = $${paramIdx++}::jsonb`);
    values.push(JSON.stringify(body.preferences));
  }
  if (body.step !== undefined) {
    updates.push(`step = $${paramIdx++}`);
    values.push(body.step);
  }

  if (updates.length === 0) {
    return NextResponse.json({ success: true });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  await queryOne(
    `UPDATE draft_applications SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
    values
  );

  return NextResponse.json({ success: true });
}
