import { redirect } from "next/navigation";
import { getStaffingSession } from "@/lib/auth";

export default async function StaffingRootPage() {
  const session = await getStaffingSession();
  if (session) {
    redirect("/staffing/portal");
  }
  redirect("/staffing/login");
}
