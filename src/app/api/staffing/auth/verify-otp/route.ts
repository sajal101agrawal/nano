import { NextRequest, NextResponse } from "next/server";
import { verifyOTP } from "@/lib/otp";
import { createStaffingSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import type { StaffingUser, StaffingSession } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code } = body as { email?: string; code?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "email is required" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      return NextResponse.json(
        { success: false, error: "code must be a 6-digit number" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const result = await verifyOTP(trimmedEmail, "email", code.trim());

    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: result.error || "Invalid or expired code" },
        { status: 401 }
      );
    }

    const user = await queryOne<StaffingUser & { company_id: string }>(
      `SELECT su.*, su.company_id
       FROM staffing_users su
       WHERE su.email = $1 AND su.status = 'active'`,
      [trimmedEmail]
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No active account found for this email. Please register first.", notRegistered: true },
        { status: 404 }
      );
    }

    await queryOne(
      "UPDATE staffing_users SET last_login_at = NOW() WHERE id = $1",
      [user.id]
    );

    const session: StaffingSession = {
      userId: user.id,
      companyId: user.company_id,
      email: user.email,
      name: user.name,
      designation: user.designation,
    };

    await createStaffingSession(session);

    return NextResponse.json({ success: true, session });
  } catch (err) {
    console.error("[staffing/verify-otp] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
