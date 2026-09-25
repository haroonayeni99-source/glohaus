import Link from "next/link";
import { Users, MapPin, ArrowUpRight } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { followedProfessionals } from "@/modules/follows/repository";
import { PlatformLabel } from "@/components/platform-labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Following" };

export default async function Page() {
  const result = await pageAccount("customer");
  if (!result.account)
    return <AuthFrame><AccessMessage code={result.error} /></AuthFrame>;

  const professionals = await withIdentity(result.account.authId, (db) =>
    followedProfessionals(db, result.account!.id),
  );

  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page following-page">
        <p className="eyebrow">YOUR GLOHAUS COMMUNITY</p>
        <h1>Professionals you <em>follow.</em></h1>
        <p className="lead">Keep up with the beauty professionals you want to book, revisit and support.</p>
        {professionals.length ? (
          <div className="following-list">
            {professionals.map((pro) => (
              <Link className="following-row" href={`/p/${pro.slug}`} key={pro.id}>
                <span className="following-avatar" aria-hidden>{pro.business_name.slice(0, 1)}</span>
                <span className="following-copy">
                  <strong>{pro.business_name}</strong>
                  <small><PlatformLabel name={pro.category} /> · <MapPin size={13} aria-hidden /> {pro.city}</small>
                  <span>{pro.bio}</span>
                </span>
                <ArrowUpRight size={19} aria-hidden />
              </Link>
            ))}
          </div>
        ) : (
          <section className="catalog-empty">
            <Users size={32} aria-hidden />
            <h2>Your following list is ready to grow.</h2>
            <p>Follow professionals from their GLOHAUS profile and they will appear here.</p>
            <Link className="button small" href="/explore">Explore professionals</Link>
          </section>
        )}
      </main>
      <BottomNavigation active="profile" />
    </>
  );
}
