import { pageAccount } from "@/lib/page-access";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your professional workspace" };
export default async function Page() {
  const result = await pageAccount("professional");
  return result.account ? (
    <WorkspaceShell account={result.account} role="professional" />
  ) : (
    <AuthFrame>
      <AccessMessage code={result.error} />
    </AuthFrame>
  );
}
