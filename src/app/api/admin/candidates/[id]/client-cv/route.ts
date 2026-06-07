import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import path from "path";
import type { CandidateProfile, Candidate, CandidateSkill } from "@/types";

// ── Awesome-CV faithful colour palette ──────────────────────────────────────
const DARKGRAY = "#333333";   // name last name
const GRAY = "#5D5D5D";       // name first name, graytext
const LIGHTGRAY = "#999999";  // lighttext, dividers
const DARKTEXT = "#414141";   // body text
const ACCENT = "#0395DE";     // skyblue accent (position, section colour, icons)

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Resolve fonts relative to this file's location
const FONTS = path.resolve(process.cwd(), "src/assets/fonts");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const [candidate, profile, skills, settings] = await Promise.all([
      queryOne<Candidate>("SELECT * FROM candidates WHERE id = $1 AND status != 'deleted'", [id]),
      queryOne<CandidateProfile>(
        "SELECT * FROM candidate_profiles WHERE candidate_id = $1 AND is_current = TRUE", [id]
      ),
      query<CandidateSkill>(
        "SELECT * FROM candidate_skills WHERE candidate_id = $1 ORDER BY years DESC NULLS LAST LIMIT 30", [id]
      ),
      query<{ key: string; value: string }>("SELECT key, value FROM app_settings").catch(() => [] as { key: string; value: string }[]),
    ]);

    if (!candidate) return new NextResponse("Not found", { status: 404 });

    const cfg = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));
    const parsedCV = profile?.parsed_json;

    const roles = (parsedCV?.roles || []) as Array<{
      title: string; company: string; location?: string;
      start_date?: string; end_date?: string; is_current?: boolean;
      summary?: string; achievements?: string[];
    }>;
    const education = (parsedCV?.education || []) as Array<{
      institution: string; degree?: string; field?: string;
      graduation_year?: string; grade?: string;
    }>;
    const certifications = (parsedCV?.certifications || []) as Array<{
      name: string; issuer?: string; year?: string;
    }>;
    const languages = (parsedCV?.languages || []) as Array<{
      language: string; proficiency?: string;
    }>;

    const fullName = candidate.full_name || candidate.primary_email || "Candidate";
    // Split into first/last for the two-tone header
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts.slice(0, -1).join(" ") || fullName;
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

    const agencyName = cfg.agency_name || "";
    const agencyEmail = cfg.agency_email || "";
    const agencyPhone = cfg.agency_phone || "";
    const agencyWebsite = cfg.agency_website || "";

    const PDFDocument = (await import("pdfkit")).default;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      info: { Title: `${fullName} — CV`, Author: agencyName || "Recruiter" },
    });

    // Register fonts — Awesome CV uses Roboto for headers, Source Sans Pro for body
    doc.registerFont("Roboto-Light", path.join(FONTS, "Roboto-Light.ttf"));
    doc.registerFont("Roboto", path.join(FONTS, "Roboto-Regular.ttf"));
    doc.registerFont("Roboto-Bold", path.join(FONTS, "Roboto-Bold.ttf"));
    doc.registerFont("SSP", path.join(FONTS, "SourceSansPro-Regular.ttf"));
    doc.registerFont("SSP-Bold", path.join(FONTS, "SourceSansPro-Bold.ttf"));
    doc.registerFont("SSP-Light", path.join(FONTS, "SourceSansPro-Light.ttf"));
    doc.registerFont("SSP-Italic", path.join(FONTS, "SourceSansPro-Italic.ttf"));

    const PAGE_W = doc.page.width;   // 595.28
    const PAGE_H = doc.page.height;  // 841.89
    const ML = 57;   // 2 cm
    const MR = 57;
    const MT = 43;   // 1.5 cm
    const W = PAGE_W - ML - MR;

    // ── Cursor tracking ────────────────────────────────────────────────────
    let cy = MT;

    const checkPageBreak = (needed: number) => {
      if (cy + needed > PAGE_H - 50) {
        doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        cy = MT;
      }
    };

    // ── HEADER ─────────────────────────────────────────────────────────────
    // Name: "First" in light gray, "Last" in dark gray — Roboto Light 32pt
    const nameSize = 32;
    doc.font("Roboto-Light").fontSize(nameSize);
    const firstW = firstName ? doc.widthOfString(firstName + " ") : 0;
    doc.font("Roboto-Bold").fontSize(nameSize);
    const lastW = lastName ? doc.widthOfString(lastName) : 0;
    const totalNameW = firstW + lastW;
    const nameX = (PAGE_W - totalNameW) / 2;

    doc.font("Roboto-Light").fontSize(nameSize).fillColor(rgb(GRAY))
      .text(firstName + (lastName ? " " : ""), nameX, cy, { continued: !!lastName, lineBreak: false });
    if (lastName) {
      doc.font("Roboto-Bold").fontSize(nameSize).fillColor(rgb(DARKGRAY))
        .text(lastName, { continued: false, lineBreak: false });
    }
    cy += nameSize * 1.2 + 4;

    // Position/headline in accent colour, uppercase, spaced — 7.6pt small-caps look
    const posLine = String(parsedCV?.headline || candidate.headline || "").toUpperCase();
    if (posLine) {
      doc.font("SSP-Bold").fontSize(7.6).fillColor(rgb(ACCENT))
        .text(posLine, ML, cy, { width: W, align: "center", characterSpacing: 0.5 });
      cy += 7.6 * 1.4 + 6;
    }

    // Divider
    doc.moveTo(ML, cy).lineTo(PAGE_W - MR, cy)
      .strokeColor(rgb(LIGHTGRAY)).lineWidth(0.5).stroke();
    cy += 4;

    // Contact row — email · phone · location · linkedin · github
    const contactParts: string[] = [];
    if (agencyEmail || parsedCV?.email) contactParts.push(String(parsedCV?.email || agencyEmail || ""));
    if (candidate.primary_phone) contactParts.push(candidate.primary_phone);
    if (candidate.location || parsedCV?.location) contactParts.push(String(candidate.location || parsedCV?.location || ""));
    if (parsedCV?.linkedin) {
      const li = String(parsedCV.linkedin).replace("https://www.linkedin.com/in/", "").replace("https://linkedin.com/in/", "").replace(/\/$/, "");
      contactParts.push(`linkedin.com/in/${li}`);
    }
    if (parsedCV?.github) {
      const gh = String(parsedCV.github).replace("https://github.com/", "").replace(/\/$/, "");
      contactParts.push(`github.com/${gh}`);
    }

    if (contactParts.length) {
      const contactLine = contactParts.filter(Boolean).join("  |  ");
      doc.font("SSP").fontSize(9).fillColor(rgb(GRAY))
        .text(contactLine, ML, cy, { width: W, align: "center" });
      cy += 9 * 1.4 + 4;
    }

    // Divider
    doc.moveTo(ML, cy).lineTo(PAGE_W - MR, cy)
      .strokeColor(rgb(LIGHTGRAY)).lineWidth(0.5).stroke();
    cy += 16;

    // ── SECTION HELPER ─────────────────────────────────────────────────────
    const section = (title: string) => {
      checkPageBreak(30);
      // Accent-coloured bold title left, then full rule to right
      doc.font("SSP-Bold").fontSize(16).fillColor(rgb(ACCENT));
      const titleW = doc.widthOfString(title);
      doc.text(title, ML, cy, { lineBreak: false });
      // Rule from after title to right margin
      const ruleY = cy + 12;
      doc.moveTo(ML + titleW + 8, ruleY).lineTo(PAGE_W - MR, ruleY)
        .strokeColor(rgb(LIGHTGRAY)).lineWidth(0.4).stroke();
      cy += 16 * 1.3 + 6;
    };

    // ── SUMMARY ────────────────────────────────────────────────────────────
    if (profile?.summary) {
      section("Summary");
      checkPageBreak(40);
      doc.font("SSP").fontSize(9.5).fillColor(rgb(DARKTEXT))
        .text(profile.summary, ML, cy, { width: W, align: "justify", lineGap: 2 });
      cy = doc.y + 12;
    }

    // ── EXPERIENCE ─────────────────────────────────────────────────────────
    if (roles.length > 0) {
      section("Experience");

      for (const role of roles) {
        checkPageBreak(35);

        const dateStr = role.start_date
          ? `${role.start_date} – ${role.end_date || "Present"}`
          : "";

        // Row 1: Bold position left | date right in lightgray
        doc.font("SSP-Bold").fontSize(11).fillColor(rgb(DARKTEXT))
          .text(role.title, ML, cy, { lineBreak: false, width: W - 130 });
        if (dateStr) {
          doc.font("SSP").fontSize(8.5).fillColor(rgb(LIGHTGRAY))
            .text(dateStr, ML + W - 130, cy, { width: 130, align: "right", lineBreak: false });
        }
        cy += 11 * 1.3;

        // Row 2: Company · Location in accent color italic
        const compLine = [role.company, role.location].filter(Boolean).join(", ");
        doc.font("SSP-Italic").fontSize(9.5).fillColor(rgb(ACCENT))
          .text(compLine, ML, cy, { width: W, lineBreak: false });
        cy += 9.5 * 1.3 + 2;

        // Summary
        if (role.summary) {
          checkPageBreak(20);
          doc.font("SSP-Light").fontSize(9).fillColor(rgb(DARKTEXT))
            .text(role.summary, ML + 8, cy, { width: W - 8, lineGap: 1.5, align: "justify" });
          cy = doc.y + 3;
        }

        // Achievements
        if (role.achievements?.length) {
          for (const ach of role.achievements) {
            checkPageBreak(14);
            // Bullet: accent colour filled circle
            doc.circle(ML + 4, cy + 4.5, 1.5).fill(rgb(ACCENT));
            doc.font("SSP").fontSize(9).fillColor(rgb(DARKTEXT))
              .text(ach, ML + 12, cy, { width: W - 12, lineGap: 1.2 });
            cy = doc.y + 2;
          }
        }

        cy += 6;
      }
    }

    // ── EDUCATION ──────────────────────────────────────────────────────────
    if (education.length > 0) {
      section("Education");

      for (const edu of education) {
        checkPageBreak(30);

        const dateStr = edu.graduation_year || "";
        const degreeStr = [edu.degree, edu.field].filter(Boolean).join(", ");

        doc.font("SSP-Bold").fontSize(11).fillColor(rgb(DARKTEXT))
          .text(edu.institution, ML, cy, { lineBreak: false, width: W - 100 });
        if (dateStr) {
          doc.font("SSP").fontSize(8.5).fillColor(rgb(LIGHTGRAY))
            .text(dateStr, ML + W - 100, cy, { width: 100, align: "right", lineBreak: false });
        }
        cy += 11 * 1.3;

        if (degreeStr) {
          doc.font("SSP-Italic").fontSize(9.5).fillColor(rgb(ACCENT))
            .text(degreeStr, ML, cy, { width: W });
          cy = doc.y + 2;
        }
        if (edu.grade) {
          doc.font("SSP-Light").fontSize(9).fillColor(rgb(LIGHTGRAY))
            .text(`Grade: ${edu.grade}`, ML, cy, { width: W });
          cy = doc.y + 2;
        }
        cy += 6;
      }
    }

    // ── SKILLS ─────────────────────────────────────────────────────────────
    if (skills.length > 0) {
      section("Skills");
      checkPageBreak(30);

      // Group by category if available
      type SkillEntry = { skill: string; years?: number; proficiency?: string; category?: string };
      const grouped: Record<string, SkillEntry[]> = {};
      for (const s of skills as SkillEntry[]) {
        const cat = s.category || "other";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
      }

      const catOrder = ["technical", "framework", "tool", "language", "domain", "soft", "other"];
      const cats = catOrder.filter((c) => grouped[c]);

      if (cats.length > 1) {
        // Two-column layout
        const colW = (W - 20) / 2;
        let col = 0;
        let rowStartY = cy;
        let col2Y = cy;

        for (let i = 0; i < cats.length; i++) {
          const cat = cats[i];
          const x = col === 0 ? ML : ML + colW + 20;
          const refY = col === 0 ? rowStartY : col2Y;

          checkPageBreak(20);
          doc.font("SSP-Bold").fontSize(8.5).fillColor(rgb(GRAY))
            .text(cat.charAt(0).toUpperCase() + cat.slice(1), x, refY, { width: colW, lineBreak: false });
          let skillY = refY + 8.5 * 1.3;

          const skillLine = grouped[cat].map((s) => s.skill + (s.years ? ` (${s.years}y)` : "")).join("  ·  ");
          doc.font("SSP").fontSize(8.5).fillColor(rgb(DARKTEXT))
            .text(skillLine, x, skillY, { width: colW, lineGap: 1 });
          const afterY = doc.y + 6;

          if (col === 0) {
            rowStartY = refY;
            col2Y = refY;
            col = 1;
          } else {
            const maxY = Math.max(afterY, doc.y + 6);
            cy = Math.max(rowStartY + doc.heightOfString(grouped[cats[i - 1]].map((s) => s.skill).join(" · "), { width: colW, fontSize: 8.5 }) + 30, afterY, skillY + 30);
            col = 0;
          }
        }
        // Flush last unpaired column
        if (col === 1) cy = col2Y + 30;
      } else {
        // Single line
        const skillLine = skills.map((s) => `${s.skill}${s.years ? ` (${s.years}y)` : ""}`).join("  ·  ");
        doc.font("SSP").fontSize(9).fillColor(rgb(DARKTEXT))
          .text(skillLine, ML, cy, { width: W, lineGap: 2 });
        cy = doc.y + 10;
      }
    }

    // ── CERTIFICATIONS ─────────────────────────────────────────────────────
    if (certifications.length > 0) {
      section("Certifications");
      for (const cert of certifications) {
        checkPageBreak(20);
        doc.font("SSP-Bold").fontSize(10).fillColor(rgb(DARKTEXT))
          .text(cert.name, ML, cy, { lineBreak: false, width: W - 80 });
        if (cert.year) {
          doc.font("SSP").fontSize(8.5).fillColor(rgb(LIGHTGRAY))
            .text(cert.year, ML + W - 80, cy, { width: 80, align: "right", lineBreak: false });
        }
        cy += 10 * 1.3;
        if (cert.issuer) {
          doc.font("SSP-Italic").fontSize(9).fillColor(rgb(ACCENT))
            .text(cert.issuer, ML, cy, { width: W });
          cy = doc.y + 2;
        }
        cy += 4;
      }
    }

    // ── LANGUAGES ──────────────────────────────────────────────────────────
    if (languages.length > 0) {
      section("Languages");
      checkPageBreak(20);
      const langLine = languages.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`).join("   ·   ");
      doc.font("SSP").fontSize(9).fillColor(rgb(DARKTEXT))
        .text(langLine, ML, cy, { width: W });
      cy = doc.y + 10;
    }

    // ── FOOTER on every page ───────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let p = 0; p < totalPages; p++) {
      doc.switchToPage(p);
      const footerY = PAGE_H - 28;
      doc.moveTo(ML, footerY).lineTo(PAGE_W - MR, footerY)
        .strokeColor(rgb(LIGHTGRAY)).lineWidth(0.4).stroke();

      const footerLeft = [agencyEmail, agencyPhone, agencyWebsite].filter(Boolean).join("  ·  ");
      const footerRight = agencyName;
      doc.font("SSP").fontSize(7.5).fillColor(rgb(LIGHTGRAY))
        .text(footerLeft, ML, footerY + 5, { width: W / 2, lineBreak: false });
      if (footerRight) {
        doc.font("SSP-Bold").fontSize(7.5).fillColor(rgb(ACCENT))
          .text(footerRight, ML + W / 2, footerY + 5, { width: W / 2, align: "right" });
      }
    }

    doc.end();

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);
    const safeName = fullName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}_Profile.pdf"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[client-cv]", err);
    return new NextResponse(message, { status: 500 });
  }
}
