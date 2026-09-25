import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalProfile } from "@/components/professional-profile";
import { BookingPicker } from "@/components/booking-picker";
import { BottomNavigation } from "@/components/bottom-navigation";
import { withIdentity } from "@/lib/db";
import { publicProfile } from "@/modules/professionals/repository";
import { paymentReady } from "@/modules/payments/stripe";
import { followState } from "@/modules/follows/repository";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import type { Rule } from "@/modules/availability/domain";
export const dynamic = "force-dynamic";
export default async function Profile({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    bookService?: string;
    bookDate?: string;
    bookTime?: string;
  }>;
}) {
  const { slug } = await params;
  const booking = await searchParams;
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) notFound();
  if (!process.env.DATABASE_URL)
    return (
      <>
        <PublicHeader />
        <main id="main" className="catalog-page">
          <h1>Profiles are getting ready.</h1>
          <p>The live professional directory is not connected yet.</p>
        </main>
      </>
    );
  let viewerAuthId = "";
  try {
    viewerAuthId = (await getIdentity()).authId;
  } catch {
    // Public profiles remain viewable while signed out.
  }
  const data = await withIdentity(viewerAuthId, async (db) => {
    const profile = await publicProfile(db, slug);
    if (!profile) return null;
    const id = profile.professional.id;
    const assets = (
      await db.query<{ id: string; alt_text: string }>(
        "SELECT id,alt_text FROM beauty.public_portfolio WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 100",
        [id],
      )
    ).rows;
    const reviews = (
      await db.query<{
        id: string;
        rating: number;
        body: string;
        public_name: string;
      }>(
        "SELECT id,rating,body,public_name FROM beauty.public_reviews WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 50",
        [id],
      )
    ).rows;
    const stats = (
      await db.query<{ rating: number | null; count: number }>(
        "SELECT round(avg(rating),1)::float AS rating,count(*)::integer AS count FROM beauty.public_reviews WHERE professional_id=$1",
        [id],
      )
    ).rows[0];
    const viewer = viewerAuthId ? await findAccount(db, viewerAuthId) : null;
    const follow = await followState(db, viewer?.id ?? null, id);
    const hours = (
      await db.query<Rule>(
        'SELECT weekday,start_minute AS "startMinute",end_minute AS "endMinute" FROM beauty.public_hours WHERE professional_id=$1 ORDER BY weekday',
        [id],
      )
    ).rows;
    return { ...profile, assets, reviews, hours, stats, follow, signedIn: Boolean(viewer) };
  });
  if (!data) notFound();
  return (
    <>
      <PublicHeader />
      <ProfessionalProfile
        professional={data.professional}
        details={data.details}
        services={data.services}
        assets={data.assets}
        reviews={data.reviews}
        hours={data.hours}
        rating={data.stats.rating}
        reviewCount={data.stats.count}
        follow={{ ...data.follow, signedIn: data.signedIn }}
        booking={
          <BookingPicker
            services={data.services}
            ready={paymentReady()}
            returnPath={`/p/${slug}`}
            initialSelection={{
              serviceId: booking.bookService,
              date: booking.bookDate,
              startsAt: booking.bookTime,
            }}
          />
        }
      />
      <BottomNavigation active="search" />
    </>
  );
}
