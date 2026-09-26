import { AdminLabelEditor } from "@/components/admin-label-editor";
import { publicLabels } from "@/modules/platform/repository";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { AdminManager } from "@/components/admin-manager";
import { AdminNavigation } from "@/components/admin-navigation";
import { ShopFeeControl } from "@/components/shop-fee-control";
import { OwnerControls } from "@/components/owner-controls";
import { adminOverview, ownerControls, ownerProductFeeRule } from "@/modules/admin/repository";
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
  const isOwner = result.account.roles.includes("owner");
  const [data, labels, owner, productFee] = await Promise.all([
    adminOverview(),
    publicLabels(),
    isOwner ? ownerControls().catch(() => null) : Promise.resolve(null),
    isOwner ? ownerProductFeeRule().catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <main id="main" className="admin-workspace">
        <AdminNavigation account={result.account} />
        <div className="admin-workspace-content">
          <section id="overview" className="admin-workspace-heading">
            <p className="eyebrow">{isOwner ? "GLOHAUS OWNER · SUPER ADMIN CONTROL CENTRE" : "PLATFORM ADMINISTRATION"}</p>
            <h1>
              {isOwner ? <>Platform control, <em>with guardrails.</em></> : <>Your community, <em>cared for.</em></>}
            </h1>
            <p className="lead">
              {isOwner
                ? "Owner is the highest application role. Staff and admin access can be delegated here; Owner itself cannot be granted or removed from the web console."
                : "Every management action is authorised on the server and recorded in the audit trail."}
            </p>
            {isOwner && (
              <div className="owner-control-status" role="status">
                <strong>OWNER ACCESS ACTIVE</strong>
                <span>Server-authorised · MFA required · privileged changes audited</span>
              </div>
            )}
          </section>
          <section id="settings" className="admin-workspace-section">
            <p className="eyebrow">PLATFORM LANGUAGE</p>
            <h2>Platform labels</h2>
            <p className="lead">Set the professional title and the category language that customers see across GLOHAUS.</p>
            <AdminLabelEditor initial={labels} />
          </section>
          {owner && (
            <section id="shop-fees" className="admin-workspace-section">
              <p className="eyebrow">MARKETPLACE MONEY</p>
              <h2>Shop commission</h2>
              <p className="lead">
                Set the professional-paid commission used by new Shop checkouts.
                Each paid order keeps an immutable snapshot of the rule used at purchase.
              </p>
              <ShopFeeControl initial={productFee} />
            </section>
          )}
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
  );
}
