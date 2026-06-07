import "dotenv/config";
import { Job } from "bullmq";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const TRANSACTIONAL_FROM = `${process.env.EMAIL_FROM_NAME || "Nano"} <${process.env.EMAIL_FROM_TRANSACTIONAL || "noreply@sajaltech.com"}>`;
const OUTREACH_FROM = `${process.env.EMAIL_FROM_NAME || "Nano"} <${process.env.EMAIL_FROM_OUTREACH || "talent@mail.sajaltech.com"}>`;

import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

async function dbQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

export async function emailProcessor(job: Job): Promise<void> {
  const { messageId, to, subject, html, stream, threadId, tags } = job.data;

  const from = stream === "transactional" ? TRANSACTIONAL_FROM : OUTREACH_FROM;

  const result = await resend.emails.send({
    from,
    to,
    subject,
    html,
    tags,
    headers: threadId
      ? { "In-Reply-To": threadId, References: threadId }
      : undefined,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  const espMessageId = result.data?.id;

  await dbQuery(
    `UPDATE outreach_messages
     SET status = 'sent', esp_message_id = $2, sent_at = NOW()
     WHERE id = $1`,
    [messageId, espMessageId]
  );

  await dbQuery(
    `INSERT INTO email_events (id, message_id, event_type, occurred_at)
     VALUES (gen_random_uuid(), $1, 'sent', NOW())`,
    [messageId]
  );

  console.log(`[email] Sent message ${messageId} to ${to}`);
}
