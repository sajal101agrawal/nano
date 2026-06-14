import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import path from "path";

const NAME_DARK  = "#1a202c";
const SECTION_FG = "#1e3a5f";
const RULE_CLR   = "#1e3a5f";
const BODY_CLR   = "#2d3748";
const META_CLR   = "#4a5568";
const DATE_CLR   = "#718096";
const LIGHT_CLR  = "#a0aec0";
const BULLET_CLR = "#1e3a5f";

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

const FONTS = path.resolve(process.cwd(), "src/assets/fonts");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const [resource, profile, skills, settings] = await Promise.all([
      queryOne<{
        id: string; full_name: string | null; email: string | null; location: string | null;
        total_experience_years: number | null; notice_period_days: number | null;
        work_mode: string | null; availability_status: string;
      }>(
        "SELECT id, full_name, email, location, total_experience_years, notice_period_days, work_mode, availability_status FROM staffing_resources WHERE id=$1 AND status!='deleted'",
        [id]
      ),
      queryOne<{
        parsed_json: Record<string, unknown> | null; summary: string | null;
        total_experience_years: number | null;
      }>(
        "SELECT parsed_json, summary, total_experience_years FROM staffing_resource_profiles WHERE resource_id=$1 AND is_current=TRUE",
        [id]
      ),
      query<{ skill: string; years: number | null; proficiency: string | null }>(
        "SELECT skill, years, proficiency FROM staffing_resource_skills WHERE resource_id=$1 ORDER BY years DESC NULLS LAST LIMIT 30",
        [id]
      ),
      query<{ key: string; value: string }>("SELECT key, value FROM app_settings").catch(() => [] as { key: string; value: string }[]),
    ]);

    if (!resource) return new NextResponse("Not found", { status: 404 });

    const cfg = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
    const parsedCV = profile?.parsed_json;

    const roles = (parsedCV?.roles || []) as Array<{ title:string; company:string; location?:string; start_date?:string; end_date?:string; is_current?:boolean; summary?:string; achievements?:string[] }>;
    const projects = (parsedCV?.projects || []) as Array<{ name:string; description?:string; technologies?:string[]; url?:string; highlights?:string[] }>;
    const education = (parsedCV?.education || []) as Array<{ institution:string; degree?:string; field?:string; graduation_year?:string; grade?:string }>;
    const certifications = (parsedCV?.certifications || []) as Array<{ name:string; issuer?:string; year?:string }>;
    const awards = (parsedCV?.awards || []) as Array<{ title:string; issuer?:string; year?:string; description?:string }>;
    const publications = (parsedCV?.publications || []) as Array<{ title:string; publisher?:string; year?:string; url?:string }>;
    const languages = (parsedCV?.languages || []) as Array<{ language:string; proficiency?:string }>;

    const fullName = resource.full_name || resource.email || "Candidate";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts.slice(0,-1).join(" ") || fullName;
    const lastName  = nameParts.length > 1 ? nameParts[nameParts.length-1] : "";

    const agencyName    = cfg.agency_name    || "";
    const agencyEmail   = cfg.agency_email   || "";
    const agencyPhone   = cfg.agency_phone   || "";
    const agencyWebsite = cfg.agency_website || "";
    const agencyTagline = cfg.agency_tagline || "";

    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({
      size: "A4", margins: {top:0,bottom:0,left:0,right:0},
      bufferPages: true,
      info: { Title: `${fullName} — Profile`, Author: agencyName || "Recruiter" },
    });

    doc.registerFont("R-Light",  path.join(FONTS, "Roboto-Light.ttf"));
    doc.registerFont("R-Bold",   path.join(FONTS, "Roboto-Bold.ttf"));
    doc.registerFont("S",        path.join(FONTS, "SourceSansPro-Regular.ttf"));
    doc.registerFont("S-Bold",   path.join(FONTS, "SourceSansPro-Bold.ttf"));
    doc.registerFont("S-Light",  path.join(FONTS, "SourceSansPro-Light.ttf"));
    doc.registerFont("S-Italic", path.join(FONTS, "SourceSansPro-Italic.ttf"));

    const PW = doc.page.width;
    const ML = 57, MR = 57, MT = 48;
    const W  = PW - ML - MR;
    let cy = MT;

    const needSpace = (h: number) => {
      if (cy + h > doc.page.height - 52) {
        doc.addPage({ margins:{top:0,bottom:0,left:0,right:0} });
        cy = MT;
      }
    };

    const sectionHead = (title: string) => {
      needSpace(28);
      cy += 4;
      doc.rect(ML, cy, W, 16).fill(rgb(SECTION_FG));
      doc.font("S-Bold").fontSize(8).fillColor([255,255,255])
        .text(title.toUpperCase(), ML + 8, cy + 4, { width: W - 16, lineBreak: false, characterSpacing: 0.6 });
      cy += 20;
    };

    doc.rect(0, 0, PW, 4).fill(rgb(SECTION_FG));
    cy = MT;

    const nameSize = 28;
    doc.font("R-Light").fontSize(nameSize);
    const fw = firstName ? doc.widthOfString(firstName + " ") : 0;
    doc.font("R-Bold").fontSize(nameSize);
    const lw = lastName ? doc.widthOfString(lastName) : 0;
    const nx = (PW - fw - lw) / 2;
    doc.font("R-Light").fontSize(nameSize).fillColor(rgb(NAME_DARK))
      .text(firstName + (lastName ? " " : ""), nx, cy, { continued: !!lastName, lineBreak: false });
    if (lastName) doc.font("R-Bold").fontSize(nameSize).fillColor(rgb(NAME_DARK)).text(lastName, { lineBreak: false });
    cy += nameSize * 1.3;

    const hl = String(parsedCV?.headline || "").toUpperCase();
    if (hl) {
      doc.font("S-Bold").fontSize(7.5).fillColor(rgb(SECTION_FG))
        .text(hl, ML, cy, { width: W, align: "center", characterSpacing: 0.8 });
      cy += 7.5 * 1.5;
    }

    doc.moveTo(ML, cy).lineTo(PW - MR, cy).strokeColor(rgb(LIGHT_CLR)).lineWidth(0.4).stroke();
    cy += 5;

    const contactParts: string[] = [];
    if (agencyEmail)   contactParts.push(agencyEmail);
    if (agencyPhone)   contactParts.push(agencyPhone);
    if (agencyWebsite) contactParts.push(agencyWebsite);
    const loc = String(resource.location || parsedCV?.location || "");
    if (loc) contactParts.push(loc);

    if (contactParts.length) {
      doc.font("S").fontSize(8.5).fillColor(rgb(DATE_CLR))
        .text(contactParts.join("   ·   "), ML, cy, { width: W, align: "center" });
      cy += 8.5 * 1.5;
    }

    doc.moveTo(ML, cy).lineTo(PW - MR, cy).strokeColor(rgb(LIGHT_CLR)).lineWidth(0.4).stroke();
    cy += 12;

    const expYears = profile?.total_experience_years ?? resource.total_experience_years;
    const stats: string[] = [];
    if (expYears != null) stats.push(`${expYears} yrs experience`);
    if (parsedCV?.domain) stats.push(String(parsedCV.domain));
    if (parsedCV?.seniority) stats.push(String(parsedCV.seniority).charAt(0).toUpperCase() + String(parsedCV.seniority).slice(1) + " level");
    if (resource.notice_period_days != null) {
      stats.push(`Notice: ${resource.notice_period_days === 0 ? "Immediate" : resource.notice_period_days + " days"}`);
    }
    if (stats.length) {
      doc.font("S").fontSize(8.5).fillColor(rgb(META_CLR))
        .text(stats.join("   ·   "), ML, cy, { width: W, align: "center" });
      cy += 8.5 * 1.5 + 4;
    }

    if (profile?.summary) {
      sectionHead("Professional Summary");
      needSpace(30);
      doc.font("S").fontSize(9.5).fillColor(rgb(BODY_CLR))
        .text(profile.summary, ML, cy, { width: W, align: "justify", lineGap: 2 });
      cy = doc.y + 10;
    }

    if (roles.length > 0) {
      sectionHead("Professional Experience");
      for (const role of roles) {
        needSpace(32);
        const dateStr = role.start_date ? `${role.start_date} – ${role.end_date || "Present"}` : "";
        const titleY = cy;
        doc.font("S-Bold").fontSize(10.5).fillColor(rgb(BODY_CLR)).text(role.title, ML, titleY, { width: W - 110, lineBreak: false });
        if (dateStr) doc.font("S").fontSize(8).fillColor(rgb(DATE_CLR)).text(dateStr, ML + W - 110, titleY, { width: 110, align: "right", lineBreak: false });
        cy += 10.5 * 1.25;
        const co = [role.company, role.location].filter(Boolean).join(" · ");
        doc.font("S-Italic").fontSize(9.5).fillColor(rgb(META_CLR)).text(co, ML, cy, { width: W });
        cy = doc.y + 2;
        if (role.summary) {
          doc.font("S-Light").fontSize(9).fillColor(rgb(BODY_CLR)).text(role.summary, ML + 6, cy, { width: W - 6, lineGap: 1.5, align: "justify" });
          cy = doc.y + 2;
        }
        (role.achievements || []).forEach(ach => {
          needSpace(12);
          doc.circle(ML + 3.5, cy + 4, 1.8).fill(rgb(BULLET_CLR));
          doc.font("S").fontSize(9).fillColor(rgb(BODY_CLR)).text(ach, ML + 10, cy, { width: W - 10, lineGap: 1 });
          cy = doc.y + 1;
        });
        cy += 6;
      }
    }

    if (projects.length > 0) {
      sectionHead("Projects");
      for (const proj of projects) {
        needSpace(25);
        doc.font("S-Bold").fontSize(10.5).fillColor(rgb(BODY_CLR)).text(proj.name, ML, cy, { width: W - 130, lineBreak: false });
        if (proj.url) doc.font("S").fontSize(7.5).fillColor(rgb(DATE_CLR)).text(proj.url.replace(/^https?:\/\//, ""), ML + W - 130, cy, { width: 130, align: "right", lineBreak: false });
        cy += 10.5 * 1.25;
        if (proj.technologies?.length) { doc.font("S-Italic").fontSize(9).fillColor(rgb(META_CLR)).text(proj.technologies.join(", "), ML, cy, { width: W }); cy = doc.y + 1; }
        if (proj.description) { doc.font("S").fontSize(9).fillColor(rgb(BODY_CLR)).text(proj.description, ML + 6, cy, { width: W - 6, lineGap: 1.3 }); cy = doc.y + 1; }
        (proj.highlights || []).forEach(h => { needSpace(12); doc.circle(ML + 3.5, cy + 4, 1.8).fill(rgb(BULLET_CLR)); doc.font("S").fontSize(9).fillColor(rgb(BODY_CLR)).text(h, ML + 10, cy, { width: W - 10, lineGap: 1 }); cy = doc.y + 1; });
        cy += 5;
      }
    }

    if (education.length > 0) {
      sectionHead("Education");
      for (const edu of education) {
        needSpace(25);
        const eY = cy;
        doc.font("S-Bold").fontSize(10.5).fillColor(rgb(BODY_CLR)).text(edu.institution, ML, eY, { width: W - 80, lineBreak: false });
        if (edu.graduation_year) doc.font("S").fontSize(8).fillColor(rgb(DATE_CLR)).text(edu.graduation_year, ML + W - 80, eY, { width: 80, align: "right", lineBreak: false });
        cy += 10.5 * 1.25;
        const deg = [edu.degree, edu.field].filter(Boolean).join(", ");
        if (deg) { doc.font("S-Italic").fontSize(9.5).fillColor(rgb(META_CLR)).text(deg, ML, cy, { width: W }); cy = doc.y + 1; }
        cy += 5;
      }
    }

    if (skills.length > 0) {
      sectionHead("Skills");
      needSpace(20);
      doc.font("S").fontSize(9).fillColor(rgb(BODY_CLR))
        .text(skills.map(s => `${s.skill}${s.years ? ` (${s.years}y)` : ""}`).join("   ·   "), ML, cy, { width: W, lineGap: 2 });
      cy = doc.y + 8;
    }

    if (certifications.length > 0) {
      sectionHead("Certifications");
      for (const cert of certifications) {
        needSpace(18);
        const cY = cy;
        doc.font("S-Bold").fontSize(10).fillColor(rgb(BODY_CLR)).text(cert.name, ML, cY, { width: W - 60, lineBreak: false });
        if (cert.year) doc.font("S").fontSize(8).fillColor(rgb(DATE_CLR)).text(cert.year, ML + W - 60, cY, { width: 60, align: "right", lineBreak: false });
        cy += 10 * 1.25;
        if (cert.issuer) { doc.font("S-Italic").fontSize(9).fillColor(rgb(META_CLR)).text(cert.issuer, ML, cy, { width: W }); cy = doc.y + 1; }
        cy += 4;
      }
    }

    if (languages.length > 0) {
      sectionHead("Languages");
      needSpace(16);
      doc.font("S").fontSize(9.5).fillColor(rgb(BODY_CLR))
        .text(languages.map(l => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`).join("   ·   "), ML, cy, { width: W });
      cy = doc.y + 8;
    }

    const total = doc.bufferedPageRange().count;
    for (let p = 0; p < total; p++) {
      doc.switchToPage(p);
      const fY = doc.page.height - 32;
      doc.rect(0, doc.page.height - 4, PW, 4).fill(rgb(SECTION_FG));
      doc.moveTo(ML, fY).lineTo(PW - MR, fY).strokeColor(rgb(LIGHT_CLR)).lineWidth(0.4).stroke();
      const footerLeft = [agencyEmail, agencyPhone, agencyWebsite].filter(Boolean).join("  ·  ");
      const footerRight = agencyName + (agencyTagline ? ` — ${agencyTagline}` : "");
      doc.font("S").fontSize(7).fillColor(rgb(LIGHT_CLR)).text(footerLeft, ML, fY + 5, { width: W * 0.55, lineBreak: false });
      if (footerRight.trim()) doc.font("S-Bold").fontSize(7).fillColor(rgb(SECTION_FG)).text(footerRight, ML + W * 0.55, fY + 5, { width: W * 0.45, align: "right" });
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
    console.error("[staffing/client-cv]", err);
    return new NextResponse(err instanceof Error ? err.message : "Internal error", { status: 500 });
  }
}
