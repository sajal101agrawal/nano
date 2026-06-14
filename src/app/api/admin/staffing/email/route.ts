import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { sendEmail, renderTemplate } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      companyId,
      recipientType,
      userIds,
      templateId,
      subject,
      bodyHtml,
      variables,
      attachments,
    } = body as {
      companyId?: string;
      recipientType: "company_all" | "specific_users";
      userIds?: string[];
      templateId?: string;
      subject: string;
      bodyHtml?: string;
      variables?: Record<string, string>;
      attachments?: Array<{ filename: string; content: string; contentType: string }>;
    };

    if (!subject?.trim()) {
      return NextResponse.json({ success: false, error: "Subject is required" }, { status: 400 });
    }

    let recipients: Array<{ id: string; name: string; email: string }> = [];

    if (recipientType === "company_all" && companyId) {
      recipients = await query<{ id: string; name: string; email: string }>(
        "SELECT id, name, email FROM staffing_users WHERE company_id = $1 AND status = 'active'",
        [companyId]
      );
    } else if (recipientType === "specific_users" && userIds?.length) {
      recipients = await query<{ id: string; name: string; email: string }>(
        "SELECT id, name, email FROM staffing_users WHERE id = ANY($1) AND status = 'active'",
        [userIds]
      );
    }

    if (!recipients.length) {
      return NextResponse.json({ success: false, error: "No recipients found" }, { status: 400 });
    }

    let templateBody: string | null = null;
    let templateSubject: string = subject;

    if (templateId) {
      const tpl = await queryOne<{ subject: string; body: string }>(
        "SELECT subject, body FROM templates WHERE id = $1",
        [templateId]
      );
      if (tpl) {
        templateBody = tpl.body;
        templateSubject = tpl.subject;
      }
    }

    const results: Array<{ email: string; success: boolean; error?: string }> = [];
    const agencySettings = await queryOne<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'agency_name'",
      []
    );
    const agencyName = agencySettings?.value || "Sajal Tech";

    for (const recipient of recipients) {
      const vars: Record<string, string> = {
        contact_name: recipient.name,
        from_name: session.name,
        from_company: agencyName,
        ...(variables || {}),
      };

      const htmlContent = templateBody
        ? renderTemplate(templateBody, vars)
        : (bodyHtml || "");

      const subjectRendered = renderTemplate(templateSubject, vars);

      const result = await sendEmail({
        to: recipient.email,
        subject: subjectRendered,
        html: htmlContent,
        stream: "outreach",
        attachments: attachments?.length ? attachments : undefined,
      });

      await query(
        `INSERT INTO outreach_messages (
           id, target_type, target_id, template_id, sent_by, subject, body,
           email_to, stream, status, esp_message_id, sent_at, created_at
         ) VALUES ($1, 'staffing_user', $2, $3, $4, $5, $6, $7, 'outreach', $8, $9, NOW(), NOW())`,
        [
          uuidv4(), recipient.id, templateId || null, session.userId,
          subjectRendered, htmlContent, recipient.email,
          result.success ? "sent" : "failed",
          result.success ? result.id : null,
        ]
      );

      results.push({ email: recipient.email, success: result.success, error: result.error });
    }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({ success: true, data: { sent: successCount, total: results.length, results } });
  } catch (err) {
    console.error("[admin/staffing/email POST]", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
