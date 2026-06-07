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
      targetType: rawTargetType,
      targetId: rawTargetId,
      // Legacy shorthand used by candidate detail page
      candidateId,
      requirementId,
      templateId,
      subject: rawSubject,
      body: rawBody,
      variables = {},
      cc = [],
      attachments = [],
    } = body;

    const targetType = rawTargetType || (candidateId ? "candidate" : undefined);
    const targetId   = rawTargetId   || candidateId || undefined;

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
    const renderedBody = renderTemplate(rawBody, variables);

    // Convert plain-text body to HTML so line breaks and spacing are preserved.
    // Escape HTML entities first, then convert \n to <br>.
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const fromName = process.env.EMAIL_FROM_NAME || "Sajal Tech Talent";
    const replyTo  = process.env.EMAIL_REPLY_TO  || "contact@sajaltech.com";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr><td style="background:#1e3a5f;padding:20px 32px;">
          <span style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${escapeHtml(fromName)}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;color:#374151;font-size:15px;line-height:1.7;">
          ${escapeHtml(renderedBody).replace(/\n\n+/g, "</p><p style='margin:0 0 16px;'>").replace(/\n/g, "<br>")}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            ${escapeHtml(fromName)} &middot;
            <a href="mailto:${escapeHtml(replyTo)}" style="color:#9ca3af;">${escapeHtml(replyTo)}</a>
            &middot; <a href="${escapeHtml(variables.unsubscribe_url || "")}" style="color:#9ca3af;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Determine stream
    const stream: "outreach" | "transactional" = "outreach";

    // Create message record
    const messageId = uuidv4();
    await query(
      `INSERT INTO outreach_messages (id, target_type, target_id, requirement_id, template_id, sent_by, subject, body, email_to, stream, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued')`,
      [messageId, targetType, targetId, requirementId || null, templateId || null, session.userId, subject, renderedBody, emailTo, stream]
    );

    // Enqueue
    await enqueueEmail({
      messageId,
      to: emailTo,
      subject,
      html,
      stream,
      cc: cc.filter((e: string) => e.trim()),
      attachments,
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
