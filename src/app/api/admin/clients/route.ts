import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await query<{ id: string; company_name: string }>(
    "SELECT id, company_name FROM clients ORDER BY company_name"
  );
  return NextResponse.json({ success: true, data: clients });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_name, website, notes } = await req.json();
  if (!company_name?.trim()) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM clients WHERE LOWER(company_name) = LOWER($1)",
    [company_name.trim()]
  );
  if (existing) {
    return NextResponse.json({ success: true, data: existing });
  }

  const id = uuidv4();
  await query(
    "INSERT INTO clients (id, company_name, website, notes) VALUES ($1, $2, $3, $4)",
    [id, company_name.trim(), website || null, notes || null]
  );

  return NextResponse.json({ success: true, data: { id, company_name: company_name.trim() } });
}
