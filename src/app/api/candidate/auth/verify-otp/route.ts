import { NextRequest, NextResponse } from "next/server";
import { verifyOTP } from "@/lib/otp";
import { createCandidateSession } from "@/lib/auth";
import type { CandidateSession } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, type, code } = body as {
      identifier?: string;
      type?: string;
      code?: string;
    };

    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json(
        { success: false, error: "identifier is required" },
        { status: 400 }
      );
    }

    if (type !== "email" && type !== "phone") {
      return NextResponse.json(
        { success: false, error: "type must be email or phone" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      return NextResponse.json(
        { success: false, error: "code must be a 6-digit number" },
        { status: 400 }
      );
    }

    const result = await verifyOTP(identifier.trim(), type, code.trim());

    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: result.error || "Invalid or expired code" },
        { status: 401 }
      );
    }

    const session: CandidateSession = {
      identifier: identifier.trim(),
      identifierType: type,
      verified: true,
    };

    await createCandidateSession(session);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[verify-otp] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
