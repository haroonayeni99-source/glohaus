import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { ProfessionalDashboard } from "@/components/professional-dashboard";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { professionalDashboard } from "@/modules/dashboard/repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your professional workspace" };
export default async function Page() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <AuthFrame>
        <AccessMessage code={result.error} />
      </AuthFrame>
    );
  const data = await withIdentity(result.account.authId, (db) =>
    professionalDashboard(db, result.account.professionalId!),
  );
  return <ProfessionalDashboard account={result.account} data={data} />;
}
