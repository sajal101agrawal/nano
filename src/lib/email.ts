import { Resend } from "resend";
import { query, queryOne } from "./db";
import { v4 as uuidv4 } from "uuid";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY || "re_placeholder";
    _resend = new Resend(key);
  }
  return _resend;
}

const TRANSACTIONAL_FROM = `${process.env.EMAIL_FROM_NAME || "Nano"} <${process.env.EMAIL_FROM_TRANSACTIONAL || "noreply@sajaltech.com"}>`;
const OUTREACH_FROM = `${process.env.EMAIL_FROM_NAME || "Nano"} <${process.env.EMAIL_FROM_OUTREACH || "talent@mail.sajaltech.com"}>`;
const REPLY_TO = process.env.EMAIL_REPLY_TO || "contact@sajaltech.com";
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const row = await queryOne(
    "SELECT id FROM suppression_list WHERE email = $1",
    [email.toLowerCase()]
  );
  return !!row;
}

export async function addToSuppression(
  email: string,
  reason: string
): Promise<void> {
  await query(
    `INSERT INTO suppression_list (email, reason)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase(), reason]
  );
}

export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value || "");
  }
  rendered = rendered.replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, "");
  return rendered;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  stream: "transactional" | "availability" | "outreach";
  messageId?: string;
  threadId?: string;
  tags?: Array<{ name: string; value: string }>;
  cc?: string[];
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

export async function sendEmail(
  options: SendEmailOptions
): Promise<{ id: string; success: boolean; error?: string }> {
  const from = options.stream === "transactional" ? TRANSACTIONAL_FROM : OUTREACH_FROM;

  let retries = 3;
  while (retries > 0) {
    try {
      const result = await getResend().emails.send({
        from,
        to: options.to,
        cc: options.cc?.length ? options.cc : undefined,
        reply_to: REPLY_TO,
        subject: options.subject,
        html: options.html,
        tags: options.tags,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "base64"),
          contentType: a.contentType,
        })),
        headers: options.threadId
          ? {
              "In-Reply-To": options.threadId,
              References: options.threadId,
            }
          : undefined,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return { id: result.data?.id || uuidv4(), success: true };
    } catch (err) {
      retries--;
      if (retries === 0) {
        const message = err instanceof Error ? err.message : String(err);
        return { id: uuidv4(), success: false, error: message };
      }
      await new Promise((r) => setTimeout(r, 1000 * (4 - retries)));
    }
  }

  return { id: uuidv4(), success: false, error: "Max retries exceeded" };
}

export async function sendOTPEmail(
  to: string,
  code: string,
  candidateName?: string
): Promise<{ success: boolean; error?: string }> {
  const html = `
    <div style="font-family:'Space Grotesk',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
      <div style="margin-bottom:32px;">
        <span style="font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:-0.5px;">Sajal Tech Talent</span>
      </div>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;color:#f8fafc;">Your login code</h1>
      <p style="color:#94a3b8;margin:0 0 32px;font-size:15px;">
        ${candidateName ? `Hi ${candidateName}, use` : "Use"} this code to sign in. It expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.
      </p>
      <div style="background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:24px;text-align:center;margin-bottom:32px;">
        <span style="font-size:40px;font-weight:700;letter-spacing:16px;color:#3b82f6;font-family:monospace;">${code}</span>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0;">
        This code is single-use and expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. If you didn't request this, ignore this email.
      </p>
    </div>
  `;

  const result = await sendEmail({
    to,
    subject: `Your login code: ${code}`,
    html,
    stream: "transactional",
  });

  return { success: result.success, error: result.error };
}

export async function sendConfirmationEmail(
  to: string,
  candidateName: string,
  requirementTitle: string,
  unsubscribeUrl: string
): Promise<void> {
  const html = `
    <div style="font-family:'Space Grotesk',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
      <div style="margin-bottom:32px;">
        <span style="font-size:20px;font-weight:700;color:#f8fafc;">Sajal Tech Talent</span>
      </div>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;color:#f8fafc;">Application received</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hi ${candidateName},
      </p>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Thank you for applying for <strong style="color:#f8fafc;">${requirementTitle}</strong>. We have received your application and CV.
      </p>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 32px;">
        Our team will review your profile and reach out if there is a strong match. This typically takes 2–5 business days.
      </p>
      <p style="color:#475569;font-size:12px;margin:0;">
        Sajal Tech Talent &middot; <a href="${unsubscribeUrl}" style="color:#475569;">Unsubscribe</a>
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Application received — ${requirementTitle}`,
    html,
    stream: "transactional",
  });
}
