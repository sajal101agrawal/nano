import { NextRequest, NextResponse } from "next/server";
import { getStaffingSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { uploadCV, ALLOWED_MIME_TYPES } from "@/lib/storage";
import { enqueueCVParse } from "@/lib/queue";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const session = await getStaffingSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return handleCVUpload(req, session);
    } else {
      return handleCSVUpload(req, session);
    }
  } catch (err) {
    console.error("[staffing/resources/upload] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

async function handleCVUpload(
  req: NextRequest,
  session: { companyId: string; userId: string }
) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ success: false, error: "No files provided" }, { status: 400 });
  }

  if (files.length > 50) {
    return NextResponse.json({ success: false, error: "Maximum 50 files per upload" }, { status: 400 });
  }

  const results: Array<{ filename: string; resourceId: string; status: string; error?: string }> = [];

  for (const file of files) {
    try {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        results.push({ filename: file.name, resourceId: "", status: "skipped", error: "Unsupported file type (PDF and DOCX only)" });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { url, key } = await uploadCV(buffer, file.name, file.type);

      const resourceId = uuidv4();
      const nameFallback = file.name.replace(/\.(pdf|docx|doc)$/i, "").replace(/[-_]/g, " ");

      await query(
        `INSERT INTO staffing_resources (
           id, company_id, added_by, full_name, status, availability_status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'active', 'unknown', NOW(), NOW())`,
        [resourceId, session.companyId, session.userId, nameFallback]
      );

      const profileId = uuidv4();
      await query(
        `INSERT INTO staffing_resource_profiles (
           id, resource_id, raw_cv_url, raw_cv_filename, raw_cv_size_bytes,
           parse_status, version, is_current, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'pending', 1, TRUE, NOW())`,
        [profileId, resourceId, url, file.name, buffer.length]
      );

      await enqueueCVParse({
        profileId,
        resourceId,
        cvKey: key,
        cvUrl: url,
        mimeType: file.type,
        targetType: "staffing_resource",
      });

      results.push({ filename: file.name, resourceId, status: "queued" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ filename: file.name, resourceId: "", status: "failed", error: msg });
    }
  }

  return NextResponse.json({ success: true, data: results }, { status: 201 });
}

async function handleCSVUpload(
  req: NextRequest,
  session: { companyId: string; userId: string }
) {
  const body = await req.json() as { rows?: Array<Record<string, string>> };
  const rows = body.rows || [];

  if (!rows.length) {
    return NextResponse.json({ success: false, error: "No rows provided" }, { status: 400 });
  }

  if (rows.length > 500) {
    return NextResponse.json({ success: false, error: "Maximum 500 rows per CSV upload" }, { status: 400 });
  }

  const created: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fullName = row.name?.trim() || row.full_name?.trim();

    if (!fullName) {
      errors.push(`Row ${i + 2}: name is required`);
      continue;
    }

    try {
      const skills = row.skills
        ? row.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
        : null;

      const resourceId = uuidv4();
      await query(
        `INSERT INTO staffing_resources (
           id, company_id, added_by, full_name, email, phone, current_title,
           total_experience_years, location, skills, availability_status,
           expected_rate, notice_period_days, status, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',NOW(),NOW())`,
        [
          resourceId, session.companyId, session.userId,
          fullName,
          row.email?.trim() || null,
          row.phone?.trim() || null,
          row.title?.trim() || row.current_title?.trim() || null,
          row.experience ? parseFloat(row.experience) || null : null,
          row.location?.trim() || null,
          skills,
          ["available", "unavailable", "unknown"].includes(row.availability) ? row.availability : "unknown",
          row.rate?.trim() || null,
          row.notice_period ? parseInt(row.notice_period) || null : null,
        ]
      );
      created.push(resourceId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Row ${i + 2}: ${msg}`);
    }
  }

  return NextResponse.json({
    success: true,
    data: { created: created.length, errors },
  }, { status: 201 });
}
