import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { uploadCV, ALLOWED_MIME_TYPES } from "@/lib/storage";
import { rateLimit } from "@/lib/redis";

const MAX_SIZE = 10 * 1024 * 1024;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimeType === "application/pdf" || mimeType === "application/msword") {
    const pdf = (await import("pdf-parse")).default;
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch {
      return "";
    }
  }
  return "";
}

function extractEmail(text: string): string | undefined {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
  if (!matches) return undefined;
  for (const raw of matches) {
    const email = raw.toLowerCase().trim();
    if (email.length > 254) continue;
    const [local, domain] = email.split("@");
    if (!local || !domain || local.length > 64) continue;
    if (/^(info|support|admin|noreply|no-reply|contact|sales|hello|help)@/.test(email)) continue;
    if (/\.(png|jpg|jpeg|gif|svg|pdf|doc|docx)$/i.test(email)) continue;
    const domainParts = domain.split(".");
    if (domainParts.length < 2) continue;
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2 || tld.length > 10 || !/^[a-z]+$/.test(tld)) continue;
    return email;
  }
  return undefined;
}

function extractPhone(text: string): string | undefined {
  const patterns = [
    /\+?\d{1,3}[\s\-.]?\(?\d{2,5}\)?[\s\-.]?\d{2,5}[\s\-.]?\d{2,5}[\s\-.]?\d{0,4}/g,
    /\(\d{2,5}\)[\s\-.]?\d{3,5}[\s\-.]?\d{3,5}/g,
    /\b[6-9]\d{4}[\s\-.]?\d{5}\b/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const raw of matches) {
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15) {
          if (digits.length === 10 && /^[6-9]/.test(digits)) {
            return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
          }
          if (digits.length === 12 && digits.startsWith("91")) {
            return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
          }
          return raw.trim();
        }
      }
    }
  }
  return undefined;
}

function extractName(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/@/.test(line)) continue;
    if (/https?:\/\/|www\./i.test(line)) continue;
    if (/resume|curriculum|cv|vitae|page|objective|summary|profile|experience|education|skills|contact|address|phone|email|linkedin|github/i.test(line)) continue;
    let candidate = line.replace(/^(name|full\s*name|candidate)\s*[:|\-]\s*/i, "").trim();
    candidate = candidate.replace(/[^a-zA-Z\s.''\-]/g, "").trim();
    if (candidate.length < 3) continue;
    const words = candidate.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 2 || words.length > 5) continue;
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`draft:ip:${ip}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const cvFile = formData.get("cvFile") as File | null;
  const requirementId = (formData.get("requirementId") as string | null)?.trim();

  if (!cvFile || cvFile.size === 0) {
    return NextResponse.json({ success: false, error: "CV file is required" }, { status: 400 });
  }
  if (!requirementId) {
    return NextResponse.json({ success: false, error: "requirementId is required" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(cvFile.type)) {
    return NextResponse.json({ success: false, error: "Only PDF and DOCX files are allowed" }, { status: 400 });
  }
  if (cvFile.size > MAX_SIZE) {
    return NextResponse.json({ success: false, error: "File too large. Maximum 10 MB" }, { status: 400 });
  }

  const requirement = await queryOne<{ id: string; status: string }>(
    "SELECT id, status FROM requirements WHERE id = $1 AND status = 'open'",
    [requirementId]
  );
  if (!requirement) {
    return NextResponse.json({ success: false, error: "Position not found or closed" }, { status: 404 });
  }

  try {
    const cvBuffer = Buffer.from(await cvFile.arrayBuffer());
    const { url: cvUrl, key: cvKey } = await uploadCV(cvBuffer, cvFile.name, cvFile.type);

    // Parse CV for contact info
    const text = await extractText(cvBuffer, cvFile.type);
    const parsedName = text.length > 20 ? extractName(text) : undefined;
    const parsedEmail = text.length > 20 ? extractEmail(text) : undefined;
    const parsedPhone = text.length > 20 ? extractPhone(text) : undefined;

    // Create draft
    const result = await queryOne<{ id: string }>(
      `INSERT INTO draft_applications
         (requirement_id, cv_url, cv_key, cv_filename, cv_size_bytes, cv_mime_type,
          parsed_name, parsed_email, parsed_phone, step, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'details', $10)
       RETURNING id`,
      [requirementId, cvUrl, cvKey, cvFile.name, cvFile.size, cvFile.type,
       parsedName || null, parsedEmail || null, parsedPhone || null, ip]
    );

    return NextResponse.json({
      success: true,
      draftId: result!.id,
      parsed: {
        full_name: parsedName,
        email: parsedEmail,
        phone: parsedPhone,
      },
    });
  } catch (err) {
    console.error("[candidate/draft] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process CV. Please try again." },
      { status: 500 }
    );
  }
}
