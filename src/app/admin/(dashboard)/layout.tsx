import { redirect } from "next/navigation";
import { getAdminSession, getUserById } from "@/lib/auth";
import { Sidebar } from "@/components/admin/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  if (!session.totpVerified) {
    const user = await getUserById(session.userId);
    if (user?.totp_enabled) {
      redirect("/admin/login/2fa");
    }
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar session={session} />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
