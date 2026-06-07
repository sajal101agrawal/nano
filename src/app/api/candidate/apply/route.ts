import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne, transaction } from "@/lib/db";
import { uploadCV, ALLOWED_MIME_TYPES } from "@/lib/storage";
import { enqueueCVParse } from "@/lib/queue";
import { isEmailSuppressed, sendConfirmationEmail } from "@/lib/email";
import { normalizeEmail, normalizePhone, buildUnsubscribeUrl, createNotification } from "@/lib/utils";
import { rateLimit } from "@/lib/redis";

const MAX_SIZE = 10 * 1024 * 1024;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const rateLimitResult = await rateLimit(`apply:ip:${ip}`, 10, 3600);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many submissions. Please try again later." },
      { status: 429 }
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
  const candidateEmailRaw = (formData.get("candidateEmail") as string | null)?.trim() ?? "";
  const candidatePhoneRaw = (formData.get("candidatePhone") as string | null)?.trim() ?? "";
  const preferencesRaw = (formData.get("preferences") as string | null) ?? "{}";
  const draftId = (formData.get("draftId") as string | null)?.trim() ?? "";

  // If draftId provided, load CV info from draft instead of requiring file upload
  let draftCvUrl: string | null = null;
  let draftCvKey: string | null = null;
  let draftCvFilename: string | null = null;
  let draftCvSize: number | null = null;
  let draftCvMime: string | null = null;

  if (draftId) {
    const draft = await queryOne<{
      id: string; requirement_id: string; cv_url: string; cv_key: string;
      cv_filename: string; cv_size_bytes: number; cv_mime_type: string; status: string;
    }>(
      "SELECT id, requirement_id, cv_url, cv_key, cv_filename, cv_size_bytes, cv_mime_type, status FROM draft_applications WHERE id = $1",
      [draftId]
    );
    if (draft && draft.status === "draft") {
      draftCvUrl = draft.cv_url;
      draftCvKey = draft.cv_key;
      draftCvFilename = draft.cv_filename;
      draftCvSize = draft.cv_size_bytes;
      draftCvMime = draft.cv_mime_type;
    }
  }

  const hasCvFromDraft = !!draftCvUrl;

  if (!hasCvFromDraft && (!cvFile || cvFile.size === 0)) {
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

  if (!candidateEmailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmailRaw)) {
    return NextResponse.json(
      { success: false, error: "A valid email address is required" },
      { status: 400 }
    );
  }

  if (!hasCvFromDraft) {
    if (!ALLOWED_MIME_TYPES.includes(cvFile!.type)) {
      return NextResponse.json(
        { success: false, error: "Only PDF and DOCX files are allowed" },
        { status: 400 }
      );
    }

    if (cvFile!.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large. Maximum size is 10 MB" },
        { status: 400 }
      );
    }
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

  let preferences: Record<string, unknown> = {};
  try {
    preferences = JSON.parse(preferencesRaw);
  } catch {
    preferences = {};
  }

  const prefOpenTo = Array.isArray(preferences.openTo) ? preferences.openTo as string[] : [];
  const prefLocations = Array.isArray(preferences.preferredLocations) ? preferences.preferredLocations as string[] : [];
  const noticePeriodMap: Record<string, number> = {
    immediate: 0,
    "15days": 15,
    "30days": 30,
    "60days": 60,
    "90days": 90,
    "90plus": 120,
  };
  const noticePeriodDays = typeof preferences.noticePeriod === "string"
    ? noticePeriodMap[preferences.noticePeriod] ?? null
    : null;

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

  const normalizedEmail = normalizeEmail(candidateEmailRaw);
  const normalizedPhone = candidatePhoneRaw ? normalizePhone(candidatePhoneRaw) : null;

  if (normalizedEmail) {
    const suppressed = await isEmailSuppressed(normalizedEmail);
    if (suppressed) {
      return NextResponse.json(
        { success: false, error: "This email has been unsubscribed" },
        { status: 403 }
      );
    }
  }

  try {
    let cvUrl: string;
    let cvKey: string;
    let cvFilename: string;
    let cvSize: number;
    let cvMimeType: string;

    if (hasCvFromDraft) {
      cvUrl = draftCvUrl!;
      cvKey = draftCvKey!;
      cvFilename = draftCvFilename || "resume.pdf";
      cvSize = draftCvSize || 0;
      cvMimeType = draftCvMime || "application/pdf";
    } else {
      const cvBuffer = Buffer.from(await cvFile!.arrayBuffer());
      const uploaded = await uploadCV(cvBuffer, cvFile!.name, cvFile!.type);
      cvUrl = uploaded.url;
      cvKey = uploaded.key;
      cvFilename = cvFile!.name;
      cvSize = cvFile!.size;
      cvMimeType = cvFile!.type;
    }

    let applicationId = "";
    let candidateId = "";
    let profileId = "";
    let isDuplicate = false;

    await transaction(async (client) => {
      let existingId: string | null = null;

      if (normalizedEmail) {
        const r = await client.query<{ id: string }>(
          "SELECT id FROM candidates WHERE primary_email = $1 LIMIT 1",
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
        await client.query(
          `UPDATE candidates
           SET last_active_at = NOW(),
               availability_status = 'available',
               status = CASE WHEN status = 'deleted' THEN 'active' ELSE status END,
               full_name = CASE WHEN full_name IS NULL AND $2 != '' THEN $2 ELSE full_name END,
               primary_email = COALESCE(primary_email, $3),
               primary_phone = COALESCE(primary_phone, $4),
               open_to_contract = $5,
               open_to_fulltime = $6,
               notice_period_days = $7,
               work_mode = $8,
               expected_rate = $9,
               expected_rate_currency = 'INR',
               updated_at = NOW()
           WHERE id = $1`,
          [
            candidateId,
            candidateName,
            normalizedEmail,
            normalizedPhone,
            prefOpenTo.includes("contract") || prefOpenTo.includes("freelance"),
            prefOpenTo.includes("fulltime"),
            noticePeriodDays,
            prefLocations.includes("remote") ? "remote" : "hybrid",
            preferences.expectedCtc ? String(preferences.expectedCtc) : null,
          ]
        );
        await client.query(
          "UPDATE candidate_profiles SET is_current = FALSE WHERE candidate_id = $1",
          [candidateId]
        );
      } else {
        candidateId = uuidv4();
        const upsertResult = await client.query<{ id: string }>(
          `INSERT INTO candidates
             (id, primary_email, primary_phone, full_name, source, status,
              availability_status, last_active_at, open_to_contract, open_to_fulltime,
              notice_period_days, work_mode, expected_rate, expected_rate_currency,
              created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'application', 'active', 'available', NOW(),
                   $5, $6, $7, $8, $9, 'INR', NOW(), NOW())
           ON CONFLICT (primary_email)
           DO UPDATE SET
             last_active_at = NOW(),
             availability_status = 'available',
             status = 'active',
             full_name = CASE WHEN candidates.full_name IS NULL AND $4 != '' THEN $4 ELSE candidates.full_name END,
             primary_phone = COALESCE(candidates.primary_phone, $3),
             open_to_contract = EXCLUDED.open_to_contract,
             open_to_fulltime = EXCLUDED.open_to_fulltime,
             notice_period_days = EXCLUDED.notice_period_days,
             work_mode = EXCLUDED.work_mode,
             expected_rate = EXCLUDED.expected_rate,
             expected_rate_currency = 'INR',
             updated_at = NOW()
           RETURNING id`,
          [
            candidateId,
            normalizedEmail,
            normalizedPhone,
            candidateName || null,
            prefOpenTo.includes("contract") || prefOpenTo.includes("freelance"),
            prefOpenTo.includes("fulltime"),
            noticePeriodDays,
            prefLocations.includes("remote") ? "remote" : "hybrid",
            preferences.expectedCtc ? String(preferences.expectedCtc) : null,
          ]
        );
        // If the upsert matched an existing row (conflict), use its id
        if (upsertResult.rows[0]?.id && upsertResult.rows[0].id !== candidateId) {
          candidateId = upsertResult.rows[0].id;
          await client.query(
            "UPDATE candidate_profiles SET is_current = FALSE WHERE candidate_id = $1",
            [candidateId]
          );
        }
      }

      const dupRow = await client.query<{ id: string }>(
        "SELECT id FROM applications WHERE requirement_id = $1 AND candidate_id = $2 LIMIT 1",
        [requirementId, candidateId]
      );

      if (dupRow.rows.length > 0) {
        applicationId = dupRow.rows[0].id;
        isDuplicate = true;
        return;
      }

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
        [profileId, candidateId, cvUrl, cvFilename, cvSize, nextVersion]
      );

      applicationId = uuidv4();
      await client.query(
        `INSERT INTO applications
           (id, requirement_id, candidate_id, profile_id, status, applied_at, updated_at)
         VALUES ($1, $2, $3, $4, 'applied', NOW(), NOW())`,
        [applicationId, requirementId, candidateId, profileId]
      );

      for (const [questionId, answerValue] of Object.entries(answers)) {
        await client.query(
          `INSERT INTO application_answers
             (id, application_id, question_id, answer_value, created_at)
           VALUES ($1, $2, $3, $4::jsonb, NOW())
           ON CONFLICT DO NOTHING`,
          [uuidv4(), applicationId, questionId, JSON.stringify(answerValue)]
        );
      }

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

    await enqueueCVParse({
      profileId,
      candidateId,
      applicationId,
      cvUrl,
      cvKey,
      mimeType: cvMimeType,
    });

    // Mark draft as completed if applicable
    if (draftId) {
      query(
        "UPDATE draft_applications SET status = 'completed', completed_at = NOW() WHERE id = $1",
        [draftId]
      ).catch(() => {});
    }

    createNotification("new_application", `New application: ${requirement.title}`, {
      body: candidateName
        ? `${candidateName} applied for ${requirement.title}`
        : `New application received for ${requirement.title}`,
      entityType: "application",
      entityId: applicationId,
    }).catch(() => {});

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
