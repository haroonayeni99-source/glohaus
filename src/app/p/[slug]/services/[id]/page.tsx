import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
import { publicProfile } from "@/modules/professionals/repository";
import { servicePolicy } from "@/modules/policies/repository";
import { ProfessionalPolicySummary } from "@/components/professional-policy-summary";
import { money } from "@/modules/professionals/domain";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (
    !/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug) ||
    !z.uuid().safeParse(id).success
  )
    notFound();
  const data = await withIdentity("", async (db) => {
    const profile = await publicProfile(db, slug);
    const service = profile?.services.find((s) => s.id === id);
    if (!profile || !service) return null;
    return { profile, service, policy: await servicePolicy(db, id) };
  });
  if (!data) notFound();
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link href={`/p/${slug}`}>
          Back to {data.profile.professional.business_name}
        </Link>
        <h1>{data.service.name}</h1>
        <p>
          {data.service.duration_minutes} minutes ·{" "}
          {money(data.service.price_pence)}
        </p>
        <section className="professional-policies policy-card">
          <h2>Applicable rules & booking policies</h2>
          <ProfessionalPolicySummary policy={data.policy} />
        </section>
        <Link className="button" href={`/p/${slug}?bookService=${id}#booking`}>
          Choose an appointment
        </Link>
      </main>
    </>
  );
}
