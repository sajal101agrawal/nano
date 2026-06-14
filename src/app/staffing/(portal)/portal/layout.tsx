import { redirect } from "next/navigation";
import { requireStaffingSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { StaffingSidebar } from "@/components/staffing/Sidebar";

export const dynamic = "force-dynamic";

export default async function StaffingPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffingSession();

  const company = await queryOne<{ name: string }>(
    "SELECT name FROM staffing_companies WHERE id = $1",
    [session.companyId]
  );

  if (!company) {
    redirect("/staffing/login");
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <StaffingSidebar session={session} companyName={company.name} />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
