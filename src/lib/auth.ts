import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";
import type { User, AdminSession, CandidateSession, StaffingSession } from "@/types";

const ADMIN_SESSION_COOKIE = "nano_admin_session";
const CANDIDATE_SESSION_COOKIE = "nano_candidate_session";
const STAFFING_SESSION_COOKIE = "nano_staffing_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSession(
  session: AdminSession
): Promise<string> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return token;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function createCandidateSession(
  session: CandidateSession
): Promise<string> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(CANDIDATE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });

  return token;
}

export async function getCandidateSession(): Promise<CandidateSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as CandidateSession;
  } catch {
    return null;
  }
}

export async function destroyCandidateSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CANDIDATE_SESSION_COOKIE);
}

export async function hashPassword(password: string): Promise<string> {
  try {
    const argon2 = await import("@node-rs/argon2");
    return await argon2.hash(password);
  } catch {
    const crypto = await import("crypto");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");
    return `pbkdf2:${salt}:${hash}`;
  }
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    if (hash.startsWith("pbkdf2:")) {
      const [, salt, storedHash] = hash.split(":");
      const crypto = await import("crypto");
      const derived = crypto
        .pbkdf2Sync(password, salt, 100000, 64, "sha512")
        .toString("hex");
      return derived === storedHash;
    }
    const argon2 = await import("@node-rs/argon2");
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>(
    "SELECT * FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/login");
  }
  return session as AdminSession;
}

export async function createStaffingSession(
  session: StaffingSession
): Promise<string> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(STAFFING_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return token;
}

export async function getStaffingSession(): Promise<StaffingSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(STAFFING_SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as StaffingSession;
  } catch {
    return null;
  }
}

export async function destroyStaffingSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFFING_SESSION_COOKIE);
}

export async function requireStaffingSession(): Promise<StaffingSession> {
  const session = await getStaffingSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/staffing/login");
  }
  return session as StaffingSession;
}
