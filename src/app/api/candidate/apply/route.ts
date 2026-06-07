import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getCandidateSession } from "@/lib/auth";
import { query, queryOne, transaction } from "@/lib/db";
import { uploadCV, ALLOWED_MIME_TYPES } from "@/lib/storage";
import { enqueueCVParse } from "@/lib/queue";
import { isEmailSuppressed, sendConfirmationEmail } from "@/lib/email";
import { normalizeEmail, normalizePhone, buildUnsubscribeUrl, createNotification } from "@/lib/utils";

const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getCandidateSession();
  if (!session?.verified) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid form data" },
      { status: 400 }
    );
  }

  const cvFile = formData.get("cvFile") as File | null;
  const requirementId = (formData.get("requirementId") as string | null)?.trim();
  const answersRaw = (formData.get("answers") as string | null) ?? "{}";
  const candidateName = (formData.get("candidateName") as string | null)?.trim() ?? "";
  const candidatePhoneRaw = (formData.get("candidatePhone") as string | null)?.trim() ?? "";

  if (!cvFile || cvFile.size === 0) {
    return NextResponse.json(
      { success: false, error: "CV file is required" },
      { status: 400 }
    );
  }

  if (!requirementId) {
    return NextResponse.json(
      { success: false, error: "requirementId is required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(cvFile.type)) {
    return NextResponse.json(
      { success: false, error: "Only PDF and DOCX files are allowed" },
      { status: 400 }
    );
  }

  if (cvFile.size > MAX_SIZE) {
    return NextResponse.json(
      { success: false, error: "File too large. Maximum size is 10 MB" },
      { status: 400 }
    );
  }

  let answers: Record<string, unknown> = {};
  try {
    answers = JSON.parse(answersRaw);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid answers format" },
      { status: 400 }
    );
  }

  // ---- Validate requirement is open ----
  const requirement = await queryOne<{ id: string; title: string; status: string }>(
    "SELECT id, title, status FROM requirements WHERE id = $1",
    [requirementId]
  );

  if (!requirement || requirement.status !== "open") {
    return NextResponse.json(
      { success: false, error: "This position is no longer accepting applications" },
      { status: 404 }
    );
  }

  // ---- Normalize session identifier ----
  const { identifier, identifierType } = session;
  const normalizedEmail =
    identifierType === "email" ? normalizeEmail(identifier) : null;
  const normalizedPhone =
    identifierType === "phone"
      ? normalizePhone(identifier)
      : candidatePhoneRaw
      ? normalizePhone(candidatePhoneRaw)
      : null;

  // ---- Suppression check ----
  if (normalizedEmail) {
    const suppressed = await isEmailSuppressed(normalizedEmail);
    if (suppressed) {
      return NextResponse.json(
        { success: false, error: "This email has been unsubscribed" },
        { status: 403 }
      );
    }
  }

  // ---- Check for existing duplicate application (before any writes) ----
  // We do this after resolving the candidate inside the transaction.

  try {
    // ---- Upload CV (outside transaction — S3 is not transactional) ----
    const cvBuffer = Buffer.from(await cvFile.arrayBuffer());
    const { url: cvUrl, key: cvKey } = await uploadCV(
      cvBuffer,
      cvFile.name,
      cvFile.type
    );

    let applicationId = "";
    let candidateId = "";
    let profileId = "";
    let isDuplicate = false;

    await transaction(async (client) => {
      // ---- Deduplication ----
      let existingId: string | null = null;

      if (normalizedEmail) {
        const r = await client.query<{ id: string }>(
          "SELECT id FROM candidates WHERE primary_email = $1 AND status != 'deleted' LIMIT 1",
          [normalizedEmail]
        );
        existingId = r.rows[0]?.id ?? null;
      }

      if (!existingId && normalizedPhone) {
        const r = await client.query<{ id: string }>(
          "SELECT id FROM candidates WHERE primary_phone = $1 AND status != 'deleted' LIMIT 1",
          [normalizedPhone]
        );
        existingId = r.rows[0]?.id ?? null;
      }

      if (existingId) {
        candidateId = existingId;
        // Refresh volatile fields
        await client.query(
          `UPDATE candidates
           SET last_active_at = NOW(),
               availability_status = 'available',
               full_name = CASE WHEN full_name IS NULL AND $2 != '' THEN $2 ELSE full_name END,
               primary_email = COALESCE(primary_email, $3),
               primary_phone = COALESCE(primary_phone, $4),
               updated_at = NOW()
           WHERE id = $1`,
          [candidateId, candidateName, normalizedEmail, normalizedPhone]
        );
        // Mark old profiles non-current
        await client.query(
          "UPDATE candidate_profiles SET is_current = FALSE WHERE candidate_id = $1",
          [candidateId]
        );
      } else {
        // New candidate
        candidateId = uuidv4();
        await client.query(
          `INSERT INTO candidates
             (id, primary_email, primary_phone, full_name, source, status,
              availability_status, last_active_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'application', 'active', 'available', NOW(), NOW(), NOW())`,
          [candidateId, normalizedEmail, normalizedPhone, candidateName || null]
        );
      }

      // ---- Duplicate application check ----
      const dupRow = await client.query<{ id: string }>(
        "SELECT id FROM applications WHERE requirement_id = $1 AND candidate_id = $2 LIMIT 1",
        [requirementId, candidateId]
      );

      if (dupRow.rows.length > 0) {
        applicationId = dupRow.rows[0].id;
        isDuplicate = true;
        return;
      }

      // ---- Create candidate profile ----
      profileId = uuidv4();
      const verRow = await client.query<{ max: number }>(
        "SELECT COALESCE(MAX(version), 0) AS max FROM candidate_profiles WHERE candidate_id = $1",
        [candidateId]
      );
      const nextVersion = (verRow.rows[0]?.max ?? 0) + 1;

      await client.query(
        `INSERT INTO candidate_profiles
           (id, candidate_id, raw_cv_url, raw_cv_filename, raw_cv_size_bytes,
            parse_status, version, is_current, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, TRUE, NOW())`,
        [profileId, candidateId, cvUrl, cvFile.name, cvFile.size, nextVersion]
      );

      // ---- Create application ----
      applicationId = uuidv4();
      await client.query(
        `INSERT INTO applications
           (id, requirement_id, candidate_id, profile_id, status, applied_at, updated_at)
         VALUES ($1, $2, $3, $4, 'applied', NOW(), NOW())`,
        [applicationId, requirementId, candidateId, profileId]
      );

      // ---- Insert application answers ----
      for (const [questionId, answerValue] of Object.entries(answers)) {
        await client.query(
          `INSERT INTO application_answers
             (id, application_id, question_id, answer_value, created_at)
           VALUES ($1, $2, $3, $4::jsonb, NOW())
           ON CONFLICT DO NOTHING`,
          [uuidv4(), applicationId, questionId, JSON.stringify(answerValue)]
        );
      }

      // ---- Record availability event ----
      await client.query(
        `INSERT INTO availability_events
           (id, candidate_id, status, source, token_used, requirement_id, requested_at, responded_at)
         VALUES ($1, $2, 'available', 'application', FALSE, $3, NOW(), NOW())`,
        [uuidv4(), candidateId, requirementId]
      );
    });

    if (isDuplicate) {
      return NextResponse.json(
        {
          success: false,
          error: "You have already applied for this position",
          applicationId,
        },
        { status: 409 }
      );
    }

    // ---- Enqueue CV parse ----
    await enqueueCVParse({
      profileId,
      candidateId,
      applicationId,
      cvUrl,
      cvKey,
      mimeType: cvFile.type,
    });

    // ---- Admin notification (fire-and-forget) ----
    createNotification("new_application", `New application: ${requirement.title}`, {
      body: candidateName
        ? `${candidateName} applied for ${requirement.title}`
        : `New application received for ${requirement.title}`,
      entityType: "application",
      entityId: applicationId,
    }).catch(() => {});

    // ---- Confirmation email (fire-and-forget) ----
    if (normalizedEmail) {
      const unsubUrl = buildUnsubscribeUrl(normalizedEmail);
      sendConfirmationEmail(
        normalizedEmail,
        candidateName || "there",
        requirement.title,
        unsubUrl
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, applicationId });
  } catch (err) {
    console.error("[candidate/apply]", err);
    return NextResponse.json(
      { success: false, error: "Failed to submit application. Please try again." },
      { status: 500 }
    );
  }
}
