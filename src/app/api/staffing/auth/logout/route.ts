import { NextResponse } from "next/server";
import { destroyStaffingSession } from "@/lib/auth";

export async function POST() {
  await destroyStaffingSession();
  return NextResponse.redirect(new URL("/staffing/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}
