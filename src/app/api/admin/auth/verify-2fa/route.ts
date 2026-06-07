import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, getUserById } from "@/lib/auth";
import { auditLog } from "@/lib/utils";
import { query } from "@/lib/db";
import speakeasy from "speakeasy";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    const pending = req.cookies.get("nano_2fa_pending")?.value;

    if (!pending) {
      return NextResponse.json({ error: "Session expired" }, { status: 400 });
    }

    const decoded = JSON.parse(Buffer.from(pending, "base64url").toString());
    if (Date.now() - decoded.ts > 5 * 60 * 1000) {
      return NextResponse.json({ error: "Session expired" }, { status: 400 });
    }

    const user = await getUserById(decoded.userId);
    if (!user || !user.totp_secret) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!valid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.delete("nano_2fa_pending");

    await createAdminSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      totpVerified: true,
    });

    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    await auditLog("login_2fa_success", { entityType: "user", entityId: user.id });

    return res;
  } catch (err) {
    console.error("[auth/verify-2fa]", err);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
