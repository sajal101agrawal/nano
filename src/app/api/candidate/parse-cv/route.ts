import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/redis";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

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

// --- Email validation and formatting ---

function extractEmail(text: string): string | undefined {
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailPattern);
  if (!matches || matches.length === 0) return undefined;

  for (const raw of matches) {
    const email = raw.toLowerCase().trim();

    if (email.length > 254) continue;
    const [local, domain] = email.split("@");
    if (!local || !domain) continue;
    if (local.length > 64) continue;

    // Skip obviously non-personal emails
    if (/^(info|support|admin|noreply|no-reply|contact|sales|hello|help)@/.test(email)) continue;
    // Skip image/file extensions that get misread
    if (/\.(png|jpg|jpeg|gif|svg|pdf|doc|docx)$/i.test(email)) continue;

    // Validate domain has at least one dot and valid TLD
    const domainParts = domain.split(".");
    if (domainParts.length < 2) continue;
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2 || tld.length > 10) continue;
    if (!/^[a-z]+$/.test(tld)) continue;

    return email;
  }

  return undefined;
}

// --- Phone number extraction and formatting ---

const PHONE_PATTERNS = [
  // International format: +91 98765 43210, +1-555-123-4567
  /\+?\d{1,3}[\s\-.]?\(?\d{2,5}\)?[\s\-.]?\d{2,5}[\s\-.]?\d{2,5}[\s\-.]?\d{0,4}/g,
  // Parenthesized area code: (555) 123-4567
  /\(\d{2,5}\)[\s\-.]?\d{3,5}[\s\-.]?\d{3,5}/g,
  // Indian mobile: 98765 43210, 9876543210
  /\b[6-9]\d{4}[\s\-.]?\d{5}\b/g,
];

function formatPhoneNumber(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");

  if (digits.length < 7 || digits.length > 15) return undefined;

  // Reject numbers that look like years, IDs, or PIN codes
  if (digits.length <= 6) return undefined;
  if (/^(19|20)\d{2}$/.test(digits)) return undefined;

  // Indian numbers (10 digits starting with 6-9, or 91 + 10 digits)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }

  // US/Canada numbers (10 digits or 1 + 10 digits)
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits.slice(1))) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // UK numbers (11 digits starting with 0, or 44 + 10 digits)
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+44 ${digits.slice(1, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("44")) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }

  // Generic international: prefix with + and space after country code
  if (digits.length >= 10 && digits.length <= 15) {
    if (raw.includes("+")) {
      // Already has country code
      const cc = digits.length === 12 ? digits.slice(0, 2) : digits.length === 13 ? digits.slice(0, 3) : digits.slice(0, 2);
      const rest = digits.slice(cc.length);
      return `+${cc} ${rest.slice(0, rest.length / 2)} ${rest.slice(rest.length / 2)}`.trim();
    }
    return `+${digits}`;
  }

  return undefined;
}

function extractPhone(text: string): string | undefined {
  const candidates: string[] = [];

  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      candidates.push(...matches);
    }
  }

  // Deduplicate and score
  const seen = new Set<string>();
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, "");
    if (seen.has(digits)) continue;
    seen.add(digits);

    const formatted = formatPhoneNumber(raw);
    if (formatted) return formatted;
  }

  return undefined;
}

// --- Name extraction and formatting ---

function titleCase(str: string): string {
  return str
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return "";
      // Preserve name particles in lowercase
      if (/^(de|da|di|del|van|von|der|le|la|el|al|bin|bint)$/i.test(word)) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function extractName(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Look through the first 10 lines for a name-like pattern
  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 60) continue;

    // Skip lines that are clearly not names
    if (/@/.test(line)) continue;
    if (/https?:\/\/|www\./i.test(line)) continue;
    if (/resume|curriculum|cv|vitae|page|objective|summary|profile|experience|education|skills|contact|address|phone|email|linkedin|github/i.test(line)) continue;

    // Remove common prefixes
    let candidate = line
      .replace(/^(name|full\s*name|candidate)\s*[:|\-]\s*/i, "")
      .trim();

    // Clean non-alphabetic characters (except dots, apostrophes, hyphens)
    candidate = candidate.replace(/[^a-zA-Z\s.''\-]/g, "").trim();

    if (candidate.length < 3) continue;

    const words = candidate.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 2 || words.length > 5) continue;

    // Each word should be at least 2 chars (allow single initials with dot)
    const validWords = words.every(
      (w) => w.length >= 2 || (w.length === 1 && /^[A-Z]$/.test(w))
    );
    if (!validWords) continue;

    // Should not contain all-caps technical keywords
    if (/^(HTML|CSS|PHP|SQL|API|AWS|GCP|IOS|CEO|CTO|COO)$/i.test(words.join(" "))) continue;

    return titleCase(candidate);
  }

  return undefined;
}

// --- Main extraction ---

function extractBasicInfo(text: string): { full_name?: string; email?: string; phone?: string } {
  return {
    email: extractEmail(text),
    phone: extractPhone(text),
    full_name: extractName(text),
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimitResult = await rateLimit(`parse-cv:ip:${ip}`, 20, 3600);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Try again later." },
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
  if (!cvFile || cvFile.size === 0) {
    return NextResponse.json(
      { success: false, error: "CV file is required" },
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

  try {
    const buffer = Buffer.from(await cvFile.arrayBuffer());
    const text = await extractText(buffer, cvFile.type);

    if (text.length < 20) {
      return NextResponse.json({
        success: true,
        parsed: { full_name: undefined, email: undefined, phone: undefined },
      });
    }

    const parsed = extractBasicInfo(text);
    return NextResponse.json({ success: true, parsed });
  } catch (err) {
    console.error("[parse-cv] Error:", err);
    return NextResponse.json({
      success: true,
      parsed: { full_name: undefined, email: undefined, phone: undefined },
    });
  }
}
