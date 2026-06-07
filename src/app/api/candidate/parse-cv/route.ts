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

function extractBasicInfo(text: string): { full_name?: string; email?: string; phone?: string } {
  const result: { full_name?: string; email?: string; phone?: string } = {};

  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    result.email = emailMatch[0].toLowerCase();
  }

  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      result.phone = phoneMatch[0].trim();
    }
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (line.length > 2 && line.length < 60) {
      const clean = line.replace(/[^a-zA-Z\s.']/g, "").trim();
      if (
        clean.length > 2 &&
        clean.split(/\s+/).length >= 2 &&
        clean.split(/\s+/).length <= 5 &&
        !clean.includes("@") &&
        !/\d/.test(clean) &&
        !/resume|curriculum|cv|vitae|page|contact/i.test(clean)
      ) {
        result.full_name = clean;
        break;
      }
    }
  }

  return result;
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
