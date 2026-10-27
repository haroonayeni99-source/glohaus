import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { AccessMessage } from "@/components/access-message";
import { BusinessConnections } from "@/components/business-connections";
import { businessTools } from "@/modules/business-tools/repository";
import { providerReady } from "@/modules/business-tools/oauth";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Connected calendars & social media · GLOHAUS PRO",
};
export default async function Connections({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string }>;
}) {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const a = result.account;
  const data = await withIdentity(a.authId, (db) =>
    businessTools(db, a.professionalId!),
  );
  const services = await withIdentity(
    a.authId,
    async (db) =>
      (
        await db.query<{ id: string; name: string }>(
          "SELECT id,name FROM beauty.services WHERE professional_id=$1 AND active ORDER BY name",
          [a.professionalId],
        )
      ).rows,
  );
  const ready = {
    google: providerReady("google"),
    outlook: providerReady("outlook"),
    ics: providerReady("ics"),
    instagram: providerReady("instagram"),
    tiktok: providerReady("tiktok"),
  };
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={a.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link className="pro-back-link" href="/professional/tools">
          ← Business tools
        </Link>
        <p className="pro-kicker">WORKS ALONGSIDE YOUR BUSINESS</p>
        <h1>Your calendars. Your work. Connected.</h1>
        <p className="pro-page-lead">
          Keep your regular clients and booking methods. We’re building GLOHAUS
          to help you manage availability, showcase your talent and reach
          additional customers.
        </p>
        <BusinessConnections
          {...JSON.parse(JSON.stringify(data))}
          services={services}
          ready={ready}
          callback={(await searchParams).connection}
        />
      </main>
    </div>
  );
}
