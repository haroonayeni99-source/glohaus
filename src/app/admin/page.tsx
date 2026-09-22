import { AdminLabelEditor } from "@/components/admin-label-editor";
import { publicLabels } from "@/modules/platform/repository";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { AdminManager } from "@/components/admin-manager";
import { AdminNavigation } from "@/components/admin-navigation";
import { OwnerControls } from "@/components/owner-controls";
import { adminOverview, ownerControls } from "@/modules/admin/repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Administration" };
export default async function Page() {
  const result = await pageAccount("admin");
  if (!result.account)
    return (
      <AuthFrame>
        <AccessMessage code={result.error} />
      </AuthFrame>
    );
  const [data, labels, owner] = await Promise.all([
    adminOverview(),
    publicLabels(),
    result.account.roles.includes("owner")
      ? ownerControls().catch(() => null)
      : Promise.resolve(null),
  ]);
  return (
    <>
      <PublicHeader />
      <main id="main" className="admin-workspace">
        <AdminNavigation account={result.account} />
        <div className="admin-workspace-content">
          <section id="overview" className="admin-workspace-heading">
            <p className="eyebrow">PLATFORM ADMINISTRATION</p>
            <h1>
              Your community, <em>cared for.</em>
            </h1>
            <p className="lead">Every management action is authorised on the server and recorded in the audit trail.</p>
          </section>
          <section id="professionals" className="admin-workspace-section">
            <h2>Platform labels</h2>
            <AdminLabelEditor initial={labels} />
          </section>
          {owner && (
            <section id="staff" className="admin-workspace-section">
              <h2>Staff & admins</h2>
              <p className="lead">Only the owner can delegate or remove privileged access. Owner access cannot be granted here.</p>
              <OwnerControls data={owner} users={data.users} />
            </section>
          )}
          <AdminManager data={data} />
          {owner && (
            <section id="audit" className="admin-workspace-section">
              <h2>Owner audit log</h2>
              <div className="service-edit-list">
                {owner.audit.map((entry) => (
                  <article className="service-edit-row" key={entry.id}>
                    <div>
                      <h3>{entry.action}</h3>
                      <p>{entry.actor_role || "operator"} · {new Date(entry.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
                      <small>{entry.reason}</small>
                    </div>
                  </article>
                ))}
                {!owner.audit.length && <p className="lead">No owner audit events yet.</p>}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
