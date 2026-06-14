import { NextRequest, NextResponse } from "next/server";
import { verifyOTP } from "@/lib/otp";
import { createStaffingSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { isConsumerDomain, extractDomain } from "@/lib/staffing-domains";
import { v4 as uuidv4 } from "uuid";
import type { StaffingSession } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, designation, email, code, companyId, companyName } = body as {
      name?: string;
      designation?: string;
      email?: string;
      code?: string;
      companyId?: string;
      companyName?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }
    if (!email?.trim()) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }
    if (!code?.trim()) {
      return NextResponse.json({ success: false, error: "Verification code is required" }, { status: 400 });
    }
    if (!companyId && !companyName?.trim()) {
      return NextResponse.json({ success: false, error: "Company is required" }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (isConsumerDomain(trimmedEmail)) {
      return NextResponse.json(
        { success: false, error: "Please use your company email address. Personal email providers are not accepted." },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ success: false, error: "code must be a 6-digit number" }, { status: 400 });
    }

    const otpResult = await verifyOTP(trimmedEmail, "email", code.trim());
    if (!otpResult.valid) {
      return NextResponse.json(
        { success: false, error: otpResult.error || "Invalid or expired verification code" },
        { status: 401 }
      );
    }

    const existingUser = await queryOne<{ id: string }>(
      "SELECT id FROM staffing_users WHERE email = $1",
      [trimmedEmail]
    );
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists. Please log in instead." },
        { status: 409 }
      );
    }

    const emailDomain = extractDomain(trimmedEmail);

    let resolvedCompanyId: string;

    if (companyId) {
      const company = await queryOne<{ id: string; domain: string | null }>(
        "SELECT id, domain FROM staffing_companies WHERE id = $1",
        [companyId]
      );
      if (!company) {
        return NextResponse.json({ success: false, error: "Selected company not found" }, { status: 400 });
      }
      if (company.domain && company.domain !== emailDomain) {
        return NextResponse.json(
          { success: false, error: `Your email domain (@${emailDomain}) does not match this company's domain (@${company.domain}). Please use your official company email.` },
          { status: 400 }
        );
      }
      if (!company.domain) {
        await query(
          "UPDATE staffing_companies SET domain = $1, updated_at = NOW() WHERE id = $2",
          [emailDomain, company.id]
        );
      }
      resolvedCompanyId = company.id;
    } else {
      const newCompanyId = uuidv4();
      await query(
        `INSERT INTO staffing_companies (id, name, domain, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [newCompanyId, companyName!.trim(), emailDomain]
      );
      resolvedCompanyId = newCompanyId;
    }

    const userId = uuidv4();
    await query(
      `INSERT INTO staffing_users (id, company_id, email, name, designation, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())`,
      [userId, resolvedCompanyId, trimmedEmail, name.trim(), designation?.trim() || null]
    );

    const session: StaffingSession = {
      userId,
      companyId: resolvedCompanyId,
      email: trimmedEmail,
      name: name.trim(),
      designation: designation?.trim(),
    };

    await createStaffingSession(session);

    return NextResponse.json({ success: true, session });
  } catch (err) {
    console.error("[staffing/register] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
