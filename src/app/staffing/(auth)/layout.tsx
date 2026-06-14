import { redirect } from "next/navigation";
import { getStaffingSession } from "@/lib/auth";

export default async function StaffingAuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffingSession();
  if (session) {
    redirect("/staffing/portal");
  }
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
