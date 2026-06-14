import { NextRequest, NextResponse } from "next/server";
import { sendOTP } from "@/lib/otp";
import { rateLimit } from "@/lib/redis";
import { isConsumerDomain } from "@/lib/staffing-domains";

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
    const { email } = body as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "email is required" },
        { status: 400 }
      );
    }

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (isConsumerDomain(trimmed)) {
      return NextResponse.json(
        { success: false, error: "Please use your company email address. Personal email providers (Gmail, Hotmail, etc.) are not accepted." },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const ipKey = `otp:ip:${ip}`;
    const ipLimit = await rateLimit(ipKey, 10, 3600);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, rateLimited: true, error: "Too many requests from this network. Try again later." },
        { status: 429 }
      );
    }

    const result = await sendOTP(trimmed, "email", ip);

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
    console.error("[staffing/request-otp] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
