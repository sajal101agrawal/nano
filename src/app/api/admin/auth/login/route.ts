import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, verifyPassword, createAdminSession } from "@/lib/auth";
import { auditLog } from "@/lib/utils";
import { rateLimit } from "@/lib/redis";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const { allowed } = await rateLimit(`login:${ip}`, 10, 900);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    const user = await getUserByEmail(email);

    if (!user || !user.password_hash) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await auditLog("login_failed", {
        entityType: "user",
        entityId: user.id,
        metadata: { email },
        ipAddress: ip,
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (user.totp_enabled) {
      // Store partial session in a temp cookie for 2FA completion
      const tempToken = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString("base64url");
      const res = NextResponse.json({ requiresTOTP: true });
      res.cookies.set("nano_2fa_pending", tempToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 300,
        path: "/",
      });
      return res;
    }

    await createAdminSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      totpVerified: false,
    });

    await query(
      "UPDATE users SET last_login_at = NOW() WHERE id = $1",
      [user.id]
    );

    await auditLog("login_success", {
      entityType: "user",
      entityId: user.id,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json(
      { error: "An error occurred" },
      { status: 500 }
    );
  }
}
