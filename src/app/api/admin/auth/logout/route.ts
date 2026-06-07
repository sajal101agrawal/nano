import { NextRequest, NextResponse } from "next/server";
import { destroyAdminSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await destroyAdminSession();
  return NextResponse.redirect(new URL("/admin/login", req.url));
}
