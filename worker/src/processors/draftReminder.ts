import "dotenv/config";
import { Job } from "bullmq";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

interface DraftReminderJobData {
  type: "check_15m" | "check_6h" | "expire_stale";
}

async function sendReminderEmail(
  to: string,
  candidateName: string,
  jobTitle: string,
  resumeLink: string,
  variant: "15m" | "6h"
) {
  const { sendEmail } = await import("../../../src/lib/email");

  const subject = variant === "15m"
    ? `Complete your application — ${jobTitle}`
    : `Your application for ${jobTitle} is incomplete`;

  const heading = variant === "15m"
    ? "You are almost there"
    : "Your application is still incomplete";

  const body = variant === "15m"
    ? `You uploaded your resume for <strong style="color:#f8fafc;">${jobTitle}</strong> but didn't finish. It only takes 30 seconds to complete.`
    : `You started applying for <strong style="color:#f8fafc;">${jobTitle}</strong> but never completed your application. Your resume is already uploaded — just fill in a few more details.`;

  const html = `
    <div style="font-family:'Space Grotesk',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
      <div style="margin-bottom:32px;">
        <span style="font-size:20px;font-weight:700;color:#f8fafc;">Sajal Tech</span>
      </div>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;color:#f8fafc;">${heading}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hi ${candidateName || "there"},
      </p>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px;">
        ${body}
      </p>
      <a href="${resumeLink}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Complete Application
      </a>
      <p style="color:#475569;font-size:12px;margin:32px 0 0;">
        Sajal Tech Careers
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    stream: "transactional",
  });
}

export async function draftReminderProcessor(job: Job<DraftReminderJobData>): Promise<void> {
  const { type } = job.data;

  if (type === "check_15m") {
    // Find drafts older than 15 minutes that haven't sent first reminder and have an email
    const result = await pool.query<{
      id: string;
      parsed_email: string;
      parsed_name: string;
      candidate_email: string;
      candidate_name: string;
      requirement_id: string;
    }>(`
      SELECT d.id, d.parsed_email, d.parsed_name, d.candidate_email, d.candidate_name, d.requirement_id
      FROM draft_applications d
      WHERE d.status = 'draft'
        AND d.reminder_sent_15m = FALSE
        AND d.created_at < NOW() - INTERVAL '15 minutes'
        AND (d.parsed_email IS NOT NULL OR d.candidate_email IS NOT NULL)
      LIMIT 50
    `);

    for (const draft of result.rows) {
      const email = draft.candidate_email || draft.parsed_email;
      const name = draft.candidate_name || draft.parsed_name || "";
      if (!email) continue;

      const reqResult = await pool.query<{ title: string; public_slug: string }>(
        "SELECT title, public_slug FROM requirements WHERE id = $1",
        [draft.requirement_id]
      );
      const req = reqResult.rows[0];
      if (!req) continue;

      const resumeLink = `${APP_URL}/jobs/${req.public_slug}?d=${draft.id}&s=details`;

      try {
        await sendReminderEmail(email, name, req.title, resumeLink, "15m");
        await pool.query(
          "UPDATE draft_applications SET reminder_sent_15m = TRUE, updated_at = NOW() WHERE id = $1",
          [draft.id]
        );
        console.log(`[draft-reminder] Sent 15m reminder to ${email} for draft ${draft.id}`);
      } catch (err) {
        console.error(`[draft-reminder] Failed 15m reminder for ${draft.id}:`, err);
      }
    }
  }

  if (type === "check_6h") {
    const result = await pool.query<{
      id: string;
      parsed_email: string;
      parsed_name: string;
      candidate_email: string;
      candidate_name: string;
      requirement_id: string;
    }>(`
      SELECT d.id, d.parsed_email, d.parsed_name, d.candidate_email, d.candidate_name, d.requirement_id
      FROM draft_applications d
      WHERE d.status = 'draft'
        AND d.reminder_sent_6h = FALSE
        AND d.created_at < NOW() - INTERVAL '6 hours'
        AND (d.parsed_email IS NOT NULL OR d.candidate_email IS NOT NULL)
      LIMIT 50
    `);

    for (const draft of result.rows) {
      const email = draft.candidate_email || draft.parsed_email;
      const name = draft.candidate_name || draft.parsed_name || "";
      if (!email) continue;

      const reqResult = await pool.query<{ title: string; public_slug: string }>(
        "SELECT title, public_slug FROM requirements WHERE id = $1",
        [draft.requirement_id]
      );
      const req = reqResult.rows[0];
      if (!req) continue;

      const resumeLink = `${APP_URL}/jobs/${req.public_slug}?d=${draft.id}&s=details`;

      try {
        await sendReminderEmail(email, name, req.title, resumeLink, "6h");
        await pool.query(
          "UPDATE draft_applications SET reminder_sent_6h = TRUE, updated_at = NOW() WHERE id = $1",
          [draft.id]
        );
        console.log(`[draft-reminder] Sent 6h reminder to ${email} for draft ${draft.id}`);
      } catch (err) {
        console.error(`[draft-reminder] Failed 6h reminder for ${draft.id}:`, err);
      }
    }
  }

  if (type === "expire_stale") {
    const result = await pool.query(
      `UPDATE draft_applications
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'draft' AND created_at < NOW() - INTERVAL '7 days'`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[draft-reminder] Expired ${result.rowCount} stale drafts`);
    }
  }
}
