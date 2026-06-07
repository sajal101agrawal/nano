import "dotenv/config";
import { Job } from "bullmq";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { Resend } from "resend";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function availabilityProcessor(job: Job): Promise<void> {
  const { type, candidateId, requirementId } = job.data;

  if (type === "send_check") {
    await sendAvailabilityCheck(candidateId, requirementId);
  } else if (type === "expire_token") {
    await expireStaleTokens();
  } else if (type === "bulk_check") {
    await sendBulkAvailabilityChecks();
  }
}

async function sendAvailabilityCheck(
  candidateId: string,
  requirementId?: string
): Promise<void> {
  const candidates = await dbQuery<{
    id: string;
    full_name: string;
    primary_email: string;
  }>(
    "SELECT id, full_name, primary_email FROM candidates WHERE id = $1 AND status = 'active'",
    [candidateId]
  );

  const candidate = candidates[0];
  if (!candidate?.primary_email) return;

  const expiryDays = parseInt(process.env.AVAILABILITY_TOKEN_EXPIRY_DAYS || "14");
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await dbQuery(
    `INSERT INTO availability_events (id, candidate_id, status, source, token, requirement_id, requested_at, expires_at)
     VALUES (gen_random_uuid(), $1, 'unknown', 'system', $2, $3, NOW(), $4)`,
    [candidateId, token, requirementId || null, expiresAt.toISOString()]
  );

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const availableUrl = `${base}/availability/confirm?token=${token}&s=available`;
  const unavailableUrl = `${base}/availability/confirm?token=${token}&s=unavailable`;
  const unsubscribeUrl = `${base}/unsubscribe?email=${encodeURIComponent(candidate.primary_email)}`;

  const html = `
    <div style="font-family:'Space Grotesk',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;">Quick availability check</h2>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Hi ${candidate.full_name || "there"}, we have an active opportunity that looks like a strong match for your background. Are you open to new roles right now?
      </p>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <a href="${availableUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Yes, I'm available</a>
          </td>
          <td width="12"></td>
          <td>
            <a href="${unavailableUrl}" style="display:inline-block;background:#374151;color:#d1d5db;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Not available now</a>
          </td>
        </tr>
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:32px;">This link expires in ${expiryDays} days. One click is all it takes.<br/><a href="${unsubscribeUrl}" style="color:#475569;">Unsubscribe</a></p>
    </div>
  `;

  await resend.emails.send({
    from: `${process.env.EMAIL_FROM_NAME || "Sajal Tech Talent"} <${process.env.EMAIL_FROM_OUTREACH || "talent@mail.sajaltech.com"}>`,
    to: candidate.primary_email,
    subject: "Quick check — are you open to new opportunities?",
    html,
  });

  console.log(`[availability] Sent check to ${candidate.primary_email}`);
}

async function expireStaleTokens(): Promise<void> {
  const result = await dbQuery(
    `UPDATE availability_events
     SET status = 'unknown', token_used = TRUE
     WHERE token IS NOT NULL
       AND token_used = FALSE
       AND expires_at < NOW()
     RETURNING candidate_id`
  );

  if (result.length > 0) {
    for (const row of result as Array<{ candidate_id: string }>) {
      await dbQuery(
        `UPDATE candidates SET availability_status = 'unknown', updated_at = NOW()
         WHERE id = $1 AND availability_status = 'available'`,
        [row.candidate_id]
      );
    }
    console.log(`[availability] Expired ${result.length} stale tokens`);
  }
}

async function sendBulkAvailabilityChecks(): Promise<void> {
  const intervalDays = parseInt(process.env.AVAILABILITY_CHECK_INTERVAL_DAYS || "21");

  const candidates = await dbQuery<{
    id: string;
    full_name: string;
    primary_email: string;
  }>(
    `SELECT c.id, c.full_name, c.primary_email
     FROM candidates c
     WHERE c.status = 'active'
       AND c.primary_email IS NOT NULL
       AND c.availability_status IN ('available', 'unknown')
       AND (
         c.last_active_at IS NULL
         OR c.last_active_at < NOW() - INTERVAL '${intervalDays} days'
       )
       AND NOT EXISTS (
         SELECT 1 FROM availability_events ae
         WHERE ae.candidate_id = c.id
           AND ae.requested_at > NOW() - INTERVAL '${intervalDays} days'
           AND ae.source = 'system'
       )
     LIMIT 50`
  );

  console.log(`[availability] Sending bulk checks to ${candidates.length} candidates`);

  for (const c of candidates) {
    try {
      await sendAvailabilityCheck(c.id);
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[availability] Failed for candidate ${c.id}:`, err);
    }
  }
}
