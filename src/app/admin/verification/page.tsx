import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { OwnerDeviceCheck } from "@/components/owner-device-check";
export const dynamic = "force-dynamic";
export const metadata = { title: "Phone and account verification" };
export default async function Page() {
  const access = await pageAccount("admin");
  if (!access.account?.roles.includes("owner"))
    return (
      <main id="main">
        <AccessMessage code={access.error ?? "FORBIDDEN"} />
      </main>
    );
  return (
    <main id="main" className="public-info-page">
      <Link href="/admin#backend-health">← Platform Health</Link>
      <OwnerDeviceCheck />
    </main>
  );
}
