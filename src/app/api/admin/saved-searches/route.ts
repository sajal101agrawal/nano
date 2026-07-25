import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { SavedSearch, ApiResponse } from "@/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query<SavedSearch>(
      `SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.userId]
    );
    return NextResponse.json<ApiResponse<SavedSearch[]>>({ success: true, data: rows });
  } catch (err) {
    console.error("[saved-searches GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      name: string;
      query_params_json: Record<string, unknown>;
      notify_on_new_match?: boolean;
    };

    if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const [row] = await query<SavedSearch>(
      `INSERT INTO saved_searches (id, user_id, name, query_params_json, notify_on_new_match)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        uuidv4(),
        session.userId,
        body.name.trim(),
        JSON.stringify(body.query_params_json || {}),
        body.notify_on_new_match || false,
      ]
    );
    return NextResponse.json<ApiResponse<SavedSearch>>({ success: true, data: row }, { status: 201 });
  } catch (err) {
    console.error("[saved-searches POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
