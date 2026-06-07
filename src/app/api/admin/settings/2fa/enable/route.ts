import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import speakeasy from "speakeasy";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { code, secret } = await req.json();

    const valid = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!valid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await query(
      "UPDATE users SET totp_enabled = TRUE, totp_secret = $1 WHERE id = $2",
      [secret, session.userId]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[2fa/enable]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
