import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { isEmailSuppressed, renderTemplate } from "@/lib/email";
import { enqueueEmail } from "@/lib/queue";
import { buildUnsubscribeUrl, auditLog } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      targetType,
      targetId,
      requirementId,
      templateId,
      subject: rawSubject,
      body: rawBody,
      variables = {},
    } = body;

    if (!targetType || !targetId || !rawSubject || !rawBody) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Resolve recipient email
    let emailTo = "";
    if (targetType === "candidate") {
      const c = await queryOne<{ primary_email: string; full_name: string }>(
        "SELECT primary_email, full_name FROM candidates WHERE id = $1",
        [targetId]
      );
      if (!c?.primary_email) {
        return NextResponse.json({ error: "Candidate has no email" }, { status: 400 });
      }
      emailTo = c.primary_email;
      if (!variables.candidate_name) variables.candidate_name = c.full_name || "";
    } else if (targetType === "prospect") {
      const p = await queryOne<{ email: string; full_name: string }>(
        "SELECT email, full_name FROM prospects WHERE id = $1",
        [targetId]
      );
      if (!p?.email) {
        return NextResponse.json({ error: "Prospect has no email" }, { status: 400 });
      }
      emailTo = p.email;
      if (!variables.candidate_name) variables.candidate_name = p.full_name || "";
    } else if (targetType === "recruiter") {
      const r = await queryOne<{ email: string; contact_name: string }>(
        "SELECT email, contact_name FROM recruiters WHERE id = $1",
        [targetId]
      );
      if (!r?.email) {
        return NextResponse.json({ error: "Recruiter has no email" }, { status: 400 });
      }
      emailTo = r.email;
      if (!variables.candidate_name) variables.candidate_name = r.contact_name || "";
    }

    // Check suppression
    const suppressed = await isEmailSuppressed(emailTo);
    if (suppressed) {
      return NextResponse.json(
        { error: `${emailTo} is on the suppression list` },
        { status: 400 }
      );
    }

    // Render template variables
    if (!variables.unsubscribe_url) {
      variables.unsubscribe_url = buildUnsubscribeUrl(emailTo);
    }
    if (!variables.from_name) variables.from_name = session.name;

    const subject = renderTemplate(rawSubject, variables);
    const html = renderTemplate(rawBody, variables);

    // Determine stream
    const stream: "outreach" | "transactional" = "outreach";

    // Create message record
    const messageId = uuidv4();
    await query(
      `INSERT INTO outreach_messages (id, target_type, target_id, requirement_id, template_id, sent_by, subject, body, email_to, stream, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued')`,
      [messageId, targetType, targetId, requirementId || null, templateId || null, session.userId, subject, html, emailTo, stream]
    );

    // Enqueue
    await enqueueEmail({
      messageId,
      to: emailTo,
      subject,
      html,
      stream,
      tags: [{ name: "target_type", value: targetType }],
    });

    await auditLog("email_sent", {
      session,
      entityType: targetType,
      entityId: targetId,
      metadata: { emailTo, subject, messageId },
    });

    return NextResponse.json({ success: true, messageId });
  } catch (err) {
    console.error("[email/send]", err);
    return NextResponse.json({ error: "Failed to queue email" }, { status: 500 });
  }
}
