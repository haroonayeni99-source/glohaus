import Link from "next/link";
export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalClientDirectory } from "@/components/professional-client-directory";
import { professionalClients } from "@/modules/dashboard/repository";

export const metadata = { title: "Your clients | GLOHAUS PRO" };

export default async function ProfessionalClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const params = await searchParams;
  const options = { q: typeof params.q === "string" ? params.q.slice(0,120) : "", view: params.view === "blocked" ? "blocked" : "all" };
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const clients = await withIdentity(result.account.authId, (db) =>
    professionalClients(db, result.account.professionalId!, options),
  );
  return (
    <>
    <p style={{padding:"12px 24px"}}><Link href="/professional/clients/import">Import consenting existing clients</Link> · <Link href="/professional/performance">Business Hub</Link></p>
    <ProfessionalClientDirectory
      clients={clients}
      options={options}
      displayName={result.account.displayName}
    />
    </>
  );
}
