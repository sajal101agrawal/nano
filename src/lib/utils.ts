import { query, queryOne } from "./db";
import { v4 as uuidv4 } from "uuid";
import type { AdminSession } from "@/types";

export async function auditLog(
  action: string,
  options: {
    session?: AdminSession | null;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(),
        options.session?.userId || null,
        action,
        options.entityType || null,
        options.entityId || null,
        options.metadata ? JSON.stringify(options.metadata) : null,
        options.ipAddress || null,
        options.userAgent || null,
      ]
    );
  } catch (err) {
    console.error("[audit] Failed to log action:", err);
  }
}

export async function createNotification(
  type: string,
  title: string,
  options: {
    body?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
  } = {}
): Promise<void> {
  try {
    const userRows = options.userId
      ? [{ id: options.userId }]
      : await query<{ id: string }>(
          "SELECT id FROM users WHERE role IN ('admin', 'recruiter')"
        );

    for (const user of userRows) {
      await query(
        `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          uuidv4(),
          user.id,
          type,
          title,
          options.body || null,
          options.entityType || null,
          options.entityId || null,
        ]
      );
    }
  } catch (err) {
    console.error("[notifications] Failed to create:", err);
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateJobSlug(title: string): string {
  const base = slugify(title);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function normalizeSkill(skill: string): string {
  return skill.toLowerCase().trim().replace(/[.\s]+/g, "_");
}

export function paginate<T>(
  items: T[],
  page: number,
  limit: number
): { data: T[]; total: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  return {
    data: items.slice(offset, offset + limit),
    total,
    totalPages,
  };
}

export function buildUnsubscribeUrl(email: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const token = Buffer.from(
    JSON.stringify({ email, ts: Date.now() })
  ).toString("base64url");
  return `${base}/unsubscribe?t=${token}`;
}

export function buildAvailabilityUrl(
  token: string,
  status: "available" | "unavailable"
): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/availability/confirm?token=${token}&s=${status}`;
}
