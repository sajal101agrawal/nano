import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";

const VALID_STATUSES = [
  "applied", "parsing", "parsed", "parse_failed", "shortlisted",
  "contacted", "in_discussion", "offered", "placed", "rejected", "withdrawn",
];

// Email templates for status changes (candidate-facing)
const STATUS_EMAIL_TEMPLATES: Record<string, { subject: string; getHtml: (name: string, jobTitle: string, appUrl: string) => string }> = {
  shortlisted: {
    subject: "Great news — you've been shortlisted",
    getHtml: (name, jobTitle, appUrl) => `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 12px;">Hi ${name},</h2>
        <p style="color:#94a3b8;margin:0 0 16px;font-size:15px;line-height:1.6;">
          You've been shortlisted for <strong style="color:#f8fafc;">${jobTitle}</strong>. Our team will be in touch shortly to discuss next steps.
        </p>
        <p style="color:#94a3b8;margin:0 0 24px;font-size:15px;line-height:1.6;">
          In the meantime, you can track your application status here:
        </p>
        <a href="${appUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
          View Application Status
        </a>
        <p style="color:#64748b;font-size:13px;margin:32px 0 0;line-height:1.6;">
          If you have any questions, reply to this email and we'll get back to you.
        </p>
      </div>`,
  },
  rejected: {
    subject: "Update on your application",
    getHtml: (name, jobTitle, _appUrl) => `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 12px;">Hi ${name},</h2>
        <p style="color:#94a3b8;margin:0 0 16px;font-size:15px;line-height:1.6;">
          Thank you for applying for <strong style="color:#f8fafc;">${jobTitle}</strong>. After careful consideration, we've decided to move forward with other candidates for this particular role.
        </p>
        <p style="color:#94a3b8;margin:0 0 24px;font-size:15px;line-height:1.6;">
          We appreciate your time and interest, and encourage you to apply for future openings that match your profile.
        </p>
        <p style="color:#64748b;font-size:13px;margin:0;line-height:1.6;">
          We wish you all the best in your search.
        </p>
      </div>`,
  },
  offered: {
    subject: "Offer extended — next steps",
    getHtml: (name, jobTitle, appUrl) => `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 12px;">Hi ${name},</h2>
        <p style="color:#94a3b8;margin:0 0 16px;font-size:15px;line-height:1.6;">
          Congratulations! We're pleased to extend an offer for <strong style="color:#f8fafc;">${jobTitle}</strong>. 
          Our team will be reaching out with the full offer details shortly.
        </p>
        <a href="${appUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
          View Your Application
        </a>
      </div>`,
  },
  placed: {
    subject: "Placement confirmed — welcome aboard",
    getHtml: (name, jobTitle, _appUrl) => `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#f8fafc;border-radius:12px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 12px;">Hi ${name},</h2>
        <p style="color:#94a3b8;margin:0 0 16px;font-size:15px;line-height:1.6;">
          Great news — your placement for <strong style="color:#f8fafc;">${jobTitle}</strong> has been confirmed. Welcome aboard!
        </p>
        <p style="color:#94a3b8;margin:0 0 24px;font-size:15px;line-height:1.6;">
          Our team will be in touch with onboarding details. Congratulations and all the best for this exciting next step.
        </p>
      </div>`,
  },
};

async function logActivity(params: {
  applicationId: string;
  requirementId: string;
  candidateId: string;
  actorId: string | undefined;
  action: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
}) {
  try {
    await query(
      `INSERT INTO application_activity_log
         (id, application_id, requirement_id, candidate_id, actor_id, action, old_value, new_value, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuidv4(),
        params.applicationId,
        params.requirementId,
        params.candidateId,
        params.actorId || null,
        params.action,
        params.oldValue || null,
        params.newValue || null,
        params.note || null,
      ]
    );
  } catch (err) {
    console.error("[activity_log]", err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      status?: string;
      rating?: number | null;
      seen?: boolean;
      pipeline_stage_id?: string | null;
    };

    // Fetch current application for logging
    const current = await query<{
      id: string; status: string; rating: number | null; seen_at: string | null;
      pipeline_stage_id: string | null; requirement_id: string; candidate_id: string;
    }>(
      "SELECT id, status, rating, seen_at, pipeline_stage_id, requirement_id, candidate_id FROM applications WHERE id = $1",
      [id]
    );

    if (!current.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const app = current[0];

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      values.push(body.status);
      updates.push(`status = $${values.length}`);
    }

    if (body.rating !== undefined) {
      if (body.rating !== null && (body.rating < 1 || body.rating > 5)) {
        return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
      }
      values.push(body.rating);
      updates.push(`rating = $${values.length}`);
    }

    if (body.seen === true && !app.seen_at) {
      updates.push(`seen_at = NOW()`);
    } else if (body.seen === false) {
      updates.push(`seen_at = NULL`);
    }

    if (body.pipeline_stage_id !== undefined) {
      values.push(body.pipeline_stage_id);
      updates.push(`pipeline_stage_id = $${values.length}`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: true });
    }

    updates.push("updated_at = NOW()");
    values.push(id);

    await query(
      `UPDATE applications SET ${updates.join(", ")} WHERE id = $${values.length}`,
      values
    );

    // Log activity
    if (body.status !== undefined && body.status !== app.status) {
      await logActivity({
        applicationId: id,
        requirementId: app.requirement_id,
        candidateId: app.candidate_id,
        actorId: session.userId,
        action: "status_changed",
        oldValue: app.status,
        newValue: body.status,
      });

      // Send automated candidate-facing email on key status changes
      const emailTemplate = STATUS_EMAIL_TEMPLATES[body.status];
      if (emailTemplate) {
        try {
          const candidateInfo = await queryOne<{
            primary_email: string | null;
            full_name: string | null;
            status_token: string | null;
            requirement_title: string;
          }>(
            `SELECT c.primary_email, c.full_name, a.status_token, r.title AS requirement_title
             FROM applications a
             JOIN candidates c ON c.id = a.candidate_id
             JOIN requirements r ON r.id = a.requirement_id
             WHERE a.id = $1`,
            [id]
          );

          if (candidateInfo?.primary_email) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const statusUrl = candidateInfo.status_token
              ? `${appUrl}/application/${candidateInfo.status_token}`
              : `${appUrl}/jobs`;

            await sendEmail({
              to: candidateInfo.primary_email,
              subject: emailTemplate.subject,
              html: emailTemplate.getHtml(
                candidateInfo.full_name || "Candidate",
                candidateInfo.requirement_title,
                statusUrl
              ),
              stream: "transactional",
            });
          }
        } catch (emailErr) {
          // Email errors should not fail the API response
          console.error("[status_email]", emailErr);
        }
      }
    }
    if (body.rating !== undefined && body.rating !== app.rating) {
      await logActivity({
        applicationId: id,
        requirementId: app.requirement_id,
        candidateId: app.candidate_id,
        actorId: session.userId,
        action: "rated",
        oldValue: app.rating?.toString(),
        newValue: body.rating?.toString(),
      });
    }
    if (body.pipeline_stage_id !== undefined && body.pipeline_stage_id !== app.pipeline_stage_id) {
      await logActivity({
        applicationId: id,
        requirementId: app.requirement_id,
        candidateId: app.candidate_id,
        actorId: session.userId,
        action: "stage_changed",
        oldValue: app.pipeline_stage_id || undefined,
        newValue: body.pipeline_stage_id || undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[applications/update]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await query(
      "DELETE FROM applications WHERE id = $1 RETURNING id",
      [id]
    );
    if (!result.length) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[applications/delete]", err);
    return NextResponse.json({ success: false, error: "Failed to delete application" }, { status: 500 });
  }
}
