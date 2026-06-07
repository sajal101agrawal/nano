import { NextRequest, NextResponse } from "next/server";
import { sendOTP } from "@/lib/otp";
import { rateLimit } from "@/lib/redis";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, type } = body as {
      identifier?: string;
      type?: string;
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

    const trimmed = identifier.trim();

    if (type === "email" && !isValidEmail(trimmed)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (type === "phone" && !isValidPhone(trimmed)) {
      return NextResponse.json(
        { success: false, error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);

    // IP-level rate limit: 10 requests per hour
    const ipKey = `otp:ip:${ip}`;
    const ipLimit = await rateLimit(ipKey, 10, 3600);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          rateLimited: true,
          error: "Too many requests from this network. Try again later.",
        },
        { status: 429 }
      );
    }

    // sendOTP handles per-identifier rate limiting (5/hour)
    const result = await sendOTP(trimmed, type, ip);

    if (!result.success) {
      if (result.rateLimited) {
        return NextResponse.json(
          { success: false, rateLimited: true, error: result.error },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send OTP" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[request-otp] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
