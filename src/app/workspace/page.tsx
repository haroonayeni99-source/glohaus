import { redirect } from "next/navigation";
import { pageAccount } from "@/lib/page-access";
import { workspacePath } from "@/modules/accounts/domain";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
export const dynamic = "force-dynamic";
export default async function Page() {
  const result = await pageAccount();
  if (result.account) redirect(workspacePath(result.account));
  return (
    <AuthFrame>
      <AccessMessage code={result.error} />
    </AuthFrame>
  );
}
