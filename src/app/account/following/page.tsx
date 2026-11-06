import { WorkspaceIntro } from "@/components/workspace-intro";
import { DiscoverNavigation } from "@/components/discover-navigation";
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
      <PublicHeader signedIn />
      <main id="main" className="catalog-page following-page">
        <DiscoverNavigation active="professionals" />
        <WorkspaceIntro eyebrow="YOUR GLOHAUS COMMUNITY" title={<>Professionals you <em>follow.</em></>}><p>Find and revisit the professionals you follow.</p></WorkspaceIntro>
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
            <h2>No followed professionals yet.</h2>
            <p>Follow a professional from their profile to save them here.</p>
            <Link className="button small" href="/explore">Explore professionals</Link>
          </section>
        )}
      </main>
      <BottomNavigation active="discover" signedIn />
    </>
  );
}
