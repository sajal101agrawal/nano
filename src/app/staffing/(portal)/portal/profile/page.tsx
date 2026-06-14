import { requireStaffingSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StaffingProfilePage() {
  const session = await requireStaffingSession();

  const user = await queryOne<{
    id: string; name: string; email: string; designation: string | null;
    status: string; last_login_at: string | null; created_at: string;
  }>(
    "SELECT id, name, email, designation, status, last_login_at, created_at FROM staffing_users WHERE id = $1",
    [session.userId]
  );

  const company = await queryOne<{ id: string; name: string; domain: string | null; website: string | null; verified: boolean }>(
    "SELECT id, name, domain, website, verified FROM staffing_companies WHERE id = $1",
    [session.companyId]
  );

  return (
    <div className="page-container max-w-2xl">
      <h1 className="section-title mb-6">Profile</h1>

      <div className="card p-5 mb-4">
        <h2 className="font-display font-semibold text-text-light text-sm mb-4">Your Account</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-text-muted">Name</dt>
            <dd className="text-sm text-text-light mt-0.5">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Email</dt>
            <dd className="text-sm text-text-light mt-0.5">{user?.email}</dd>
          </div>
          {user?.designation && (
            <div>
              <dt className="text-xs text-text-muted">Designation</dt>
              <dd className="text-sm text-text-light mt-0.5">{user.designation}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-text-muted">Account status</dt>
            <dd className="mt-0.5">
              <span className={`badge ${user?.status === "active" ? "badge-green" : "badge-red"}`}>{user?.status}</span>
            </dd>
          </div>
          {user?.last_login_at && (
            <div>
              <dt className="text-xs text-text-muted">Last login</dt>
              <dd className="text-sm text-text-dim mt-0.5">{new Date(user.last_login_at).toLocaleString()}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="card p-5">
        <h2 className="font-display font-semibold text-text-light text-sm mb-4">Company</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-text-muted">Company name</dt>
            <dd className="text-sm text-text-light mt-0.5">{company?.name}</dd>
          </div>
          {company?.domain && (
            <div>
              <dt className="text-xs text-text-muted">Domain</dt>
              <dd className="text-sm text-text-dim mt-0.5">@{company.domain}</dd>
            </div>
          )}
          {company?.website && (
            <div>
              <dt className="text-xs text-text-muted">Website</dt>
              <dd className="text-sm mt-0.5">
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-text-muted">Verified status</dt>
            <dd className="mt-0.5">
              <span className={`badge ${company?.verified ? "badge-green" : "badge-amber"}`}>
                {company?.verified ? "Verified" : "Pending verification"}
              </span>
            </dd>
          </div>
        </dl>
        {!company?.verified && (
          <p className="text-xs text-text-muted mt-4 p-3 bg-bg-tertiary rounded-lg">
            Your company is pending verification by our team. This does not restrict your access to the portal.
          </p>
        )}
      </div>
    </div>
  );
}
