import { query, queryOne } from "./db";
import { rateLimit } from "./redis";
import { sendOTPEmail } from "./email";
import { v4 as uuidv4 } from "uuid";

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || "10");
const RATE_LIMIT_PER_HOUR = parseInt(process.env.OTP_RATE_LIMIT_PER_HOUR || "5");

function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTP(
  identifier: string,
  identifierType: "email" | "phone",
  ipAddress?: string
): Promise<{ success: boolean; error?: string; rateLimited?: boolean }> {
  const normalizedId = normalizeIdentifier(identifier, identifierType);

  const rateLimitKey = `otp:${normalizedId}`;
  const { allowed, remaining, resetIn } = await rateLimit(
    rateLimitKey,
    RATE_LIMIT_PER_HOUR,
    3600
  );

  if (!allowed) {
    return {
      success: false,
      rateLimited: true,
      error: `Too many OTP requests. Try again in ${Math.ceil(resetIn / 60)} minutes.`,
    };
  }

  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO otp_tokens (id, identifier, identifier_type, code, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      normalizedId,
      identifierType,
      code,
      ipAddress || null,
      expiresAt.toISOString(),
    ]
  );

  if (identifierType === "email") {
    const result = await sendOTPEmail(normalizedId, code);
    if (!result.success) {
      return { success: false, error: "Failed to send OTP email" };
    }
  } else {
    const smsSent = await sendSMSOTP(normalizedId, code);
    if (!smsSent) {
      return { success: false, error: "Failed to send OTP SMS" };
    }
  }

  return { success: true };
}

export async function verifyOTP(
  identifier: string,
  identifierType: "email" | "phone",
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const normalizedId = normalizeIdentifier(identifier, identifierType);

  const token = await queryOne<{
    id: string;
    used: boolean;
    expires_at: string;
  }>(
    `SELECT id, used, expires_at FROM otp_tokens
     WHERE identifier = $1 AND identifier_type = $2 AND code = $3 AND used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedId, identifierType, code]
  );

  if (!token) {
    return { valid: false, error: "Invalid or expired code" };
  }

  if (new Date(token.expires_at) < new Date()) {
    return { valid: false, error: "Code has expired" };
  }

  await query("UPDATE otp_tokens SET used = TRUE WHERE id = $1", [token.id]);

  await query(
    "DELETE FROM otp_tokens WHERE identifier = $1 AND expires_at < NOW()",
    [normalizedId]
  );

  return { valid: true };
}

function normalizeIdentifier(
  identifier: string,
  type: "email" | "phone"
): string {
  if (type === "email") {
    return identifier.toLowerCase().trim();
  }
  const digits = identifier.replace(/\D/g, "");
  return digits.startsWith("91") && digits.length === 12
    ? `+${digits}`
    : digits.length === 10
    ? `+91${digits}`
    : `+${digits}`;
}

async function sendSMSOTP(phone: string, code: string): Promise<boolean> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      console.warn("[otp] Twilio not configured, skipping SMS");
      return false;
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString(
      "base64"
    );
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          To: phone,
          From: fromPhone,
          Body: `Your Nano login code is: ${code}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`,
        }),
      }
    );

    return response.ok;
  } catch (err) {
    console.error("[otp] SMS send error:", err);
    return false;
  }
}
