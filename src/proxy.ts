import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const ADMIN_SESSION_COOKIE = "nano_admin_session";
const CANDIDATE_SESSION_COOKIE = "nano_candidate_session";

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "fallback-dev-secret-minimum-32chars";
  return new TextEncoder().encode(secret);
}

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

async function verifyCandidateToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Security headers
  const headers = new Headers(req.headers);
  const response = NextResponse.next({ headers });

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Admin API routes (exclude auth endpoints)
  if (
    pathname.startsWith("/api/admin/") &&
    !pathname.startsWith("/api/admin/auth/") &&
    !pathname.startsWith("/api/admin/email/webhook")
  ) {
    const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return response;
  }

  // Admin pages (not login)
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login")
  ) {
    const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      const loginUrl = new URL("/admin/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // Candidate API protected routes (apply)
  if (pathname.startsWith("/api/candidate/apply")) {
    const token = req.cookies.get(CANDIDATE_SESSION_COOKIE)?.value;
    if (!token || !(await verifyCandidateToken(token))) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return response;
  }

  // Public routes — allow
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/candidate/apply",
    "/api/candidate/apply/:path*",
  ],
};
