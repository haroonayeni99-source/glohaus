import { AdminLabelEditor } from "@/components/admin-label-editor";
import { publicLabels } from "@/modules/platform/repository";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { AdminManager } from "@/components/admin-manager";
import { adminOverview } from "@/modules/admin/repository";
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
  const data = await adminOverview();
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <p className="eyebrow">PLATFORM ADMINISTRATION</p>
        <h1>
          Your community, <em>cared for.</em>
        </h1>
        <AdminLabelEditor initial={await publicLabels()} />
        <AdminManager data={data} />
      </main>
    </>
  );
}
