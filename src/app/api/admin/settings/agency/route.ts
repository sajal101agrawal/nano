import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ApiResponse } from "@/types";

const AGENCY_KEYS = ["agency_name", "agency_tagline", "agency_email", "agency_phone", "agency_website", "agency_address"] as const;
type AgencyKey = typeof AGENCY_KEYS[number];
type AgencySettings = Record<AgencyKey, string>;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const rows = await query<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key = ANY($1)",
      [AGENCY_KEYS as unknown as string[]]
    );

    const data = Object.fromEntries(AGENCY_KEYS.map((k) => [k, ""])) as AgencySettings;
    for (const row of rows) data[row.key as AgencyKey] = row.value;

    return NextResponse.json<ApiResponse<AgencySettings>>({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as Partial<AgencySettings>;

    for (const key of AGENCY_KEYS) {
      if (body[key] !== undefined) {
        await query(
          `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, body[key]]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
