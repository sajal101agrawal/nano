import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ApiResponse } from "@/types";

// Column mapping constants
const KNOWN_HEADERS: Record<string, string> = {
  name: "full_name",
  full_name: "full_name",
  "full name": "full_name",
  email: "email",
  "email address": "email",
  phone: "phone",
  mobile: "phone",
  headline: "headline",
  title: "headline",
  "job title": "headline",
  company: "current_company",
  "current company": "current_company",
  employer: "current_company",
  experience: "experience_years",
  "years of experience": "experience_years",
  "total experience": "experience_years",
  "exp years": "experience_years",
  skills: "skills",
  location: "location",
  availability: "availability",
  "notice period": "notice_period",
  linkedin: "linkedin_url",
  "linkedin url": "linkedin_url",
};

type PreviewRow = {
  row: number;
  data: Record<string, string>;
  mapped: Record<string, string>;
  errors: string[];
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let inQuote = false;
    let cell = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(cell);
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}

function guessMapping(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  return KNOWN_HEADERS[normalized] || null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = formData.get("mode") as string || "preview";
    const mappingJson = formData.get("mapping") as string || "{}";

    if (!file) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: "CSV must have a header row and at least one data row" }, { status: 400 });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Auto-detect column mapping
    const autoMapping: Record<string, string> = {};
    headers.forEach((h, i) => {
      const field = guessMapping(h);
      if (field) autoMapping[String(i)] = field;
    });

    const userMapping: Record<string, string> = JSON.parse(mappingJson);
    const finalMapping = { ...autoMapping, ...userMapping };

    if (mode === "preview") {
      const preview: PreviewRow[] = dataRows.slice(0, 5).map((row, rowIdx) => {
        const data: Record<string, string> = {};
        const mapped: Record<string, string> = {};
        headers.forEach((h, i) => {
          data[h] = row[i] || "";
          const field = finalMapping[String(i)];
          if (field) mapped[field] = row[i] || "";
        });
        const errors: string[] = [];
        if (!mapped.email && !mapped.full_name) {
          errors.push("Row needs at least email or name");
        }
        return { row: rowIdx + 2, data, mapped, errors };
      });

      return NextResponse.json({
        success: true,
        data: {
          headers,
          autoMapping,
          totalRows: dataRows.length,
          preview,
        },
      });
    }

    // Import mode
    let inserted = 0;
    let skipped = 0;
    const importErrors: { row: number; error: string }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const mapped: Record<string, string> = {};
      headers.forEach((_, idx) => {
        const field = finalMapping[String(idx)];
        if (field) mapped[field] = row[idx]?.trim() || "";
      });

      if (!mapped.email && !mapped.full_name) {
        importErrors.push({ row: i + 2, error: "Missing email and name" });
        skipped++;
        continue;
      }

      try {
        const email = (mapped.email || "").toLowerCase();
        const fullName = mapped.full_name || null;
        const phone = mapped.phone || null;
        const headline = mapped.headline || null;
        const currentCompany = mapped.current_company || null;
        const location = mapped.location || null;
        const expYears = mapped.experience_years ? parseFloat(mapped.experience_years) : null;
        const linkedinUrl = mapped.linkedin_url || null;

        const candidate = await query<{ id: string }>(
          `INSERT INTO candidates (full_name, primary_email, phone, headline, current_company,
            location, total_experience_years, linkedin_url, source, status, availability_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'csv_import', 'active', 'unknown')
           ON CONFLICT (primary_email) WHERE primary_email IS NOT NULL DO UPDATE SET
             full_name = COALESCE(EXCLUDED.full_name, candidates.full_name),
             updated_at = NOW()
           RETURNING id`,
          [fullName, email || null, phone, headline, currentCompany, location, expYears, linkedinUrl]
        );

        if (candidate.length > 0 && mapped.skills) {
          const skills = mapped.skills.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
          for (const skill of skills) {
            await query(
              `INSERT INTO candidate_skills (candidate_id, skill) VALUES ($1, $2)
               ON CONFLICT (candidate_id, skill) DO NOTHING`,
              [candidate[0].id, skill]
            ).catch(() => null);
          }
        }

        inserted++;
      } catch (err) {
        importErrors.push({
          row: i + 2,
          error: err instanceof Error ? err.message.slice(0, 120) : "Unknown error",
        });
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { inserted, skipped, errors: importErrors.slice(0, 20) },
    });
  } catch (err) {
    console.error("CSV import error:", err);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: "Import failed" }, { status: 500 });
  }
}
