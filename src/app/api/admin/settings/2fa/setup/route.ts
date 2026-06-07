import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const secret = speakeasy.generateSecret({
      name: `Nano (${session.email})`,
      issuer: "Sajal Tech Nano",
      length: 20,
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

    await query(
      "UPDATE users SET totp_secret = $1 WHERE id = $2",
      [secret.base32, session.userId]
    );

    return NextResponse.json({
      secret: secret.base32,
      qrCode,
    });
  } catch (err) {
    console.error("[2fa/setup]", err);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
