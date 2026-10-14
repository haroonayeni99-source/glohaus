import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalPolicyEditor } from "@/components/professional-policy-editor";
import { policyWorkspace } from "@/modules/policies/repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Rules & Policies · GLOHAUS PRO" };
export default async function Page() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const data = await withIdentity(result.account.authId, policyWorkspace);
  return (
    <div className="pro-app">
      <ProfessionalNavigation
        active="more"
        displayName={result.account.displayName}
      />
      <main id="main" className="pro-main pro-management-page">
        <p className="pro-kicker">YOUR BUSINESS TERMS</p>
        <h1>Rules & Policies</h1>
        <section className="pro-editor-surface">
          <ProfessionalPolicyEditor data={data} />
        </section>
      </main>
    </div>
  );
}
