import { getAdminSession, getUserById } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [user, suppCount, agencyRows] = await Promise.all([
    getUserById(session.userId),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM suppression_list"),
    query<{ key: string; value: string }>("SELECT key, value FROM app_settings WHERE key LIKE 'agency_%'").catch(() => [] as { key: string; value: string }[]),
  ]);

  if (!user) redirect("/admin/login");

  const agency = {
    agency_name: "", agency_tagline: "", agency_email: "",
    agency_phone: "", agency_website: "", agency_address: "",
    ...Object.fromEntries(agencyRows.map((r) => [r.key, r.value])),
  };

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-6">
        <h1 className="section-title">Settings</h1>
        <p className="section-subtitle">Manage your profile, agency details and account security</p>
      </div>
      <SettingsForm
        user={{ id: user.id, email: user.email, name: user.name, role: user.role, totp_enabled: user.totp_enabled }}
        suppressedCount={parseInt(suppCount[0]?.count || "0")}
        agency={agency}
      />
    </div>
  );
}
