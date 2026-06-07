import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const prospect = await queryOne<{
      id: string;
      provider_profile_id: string;
      full_name: string;
    }>(
      "SELECT id, provider_profile_id, full_name FROM prospects WHERE id = $1",
      [id]
    );

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey || apiKey === "placeholder-replace-with-real-key") {
      return NextResponse.json({ error: "Apollo API not configured", email: null, email_status: "not_found" });
    }

    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        id: prospect.provider_profile_id,
        reveal_personal_emails: true,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ email: null, email_status: "not_found" });
    }

    const data = (await res.json()) as { person?: { email?: string; email_status?: string } };
    const email = data.person?.email || null;
    const emailStatus = email ? "found" : "not_found";

    if (email) {
      await query(
        "UPDATE prospects SET email = $1, email_status = $2, updated_at = NOW() WHERE id = $3",
        [email.toLowerCase(), emailStatus, prospect.id]
      );
    }

    return NextResponse.json({ email, email_status: emailStatus });
  } catch (err) {
    console.error("[prospects/enrich]", err);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
