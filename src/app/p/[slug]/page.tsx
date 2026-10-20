import { publicMetadata, publicOrigin, jsonLd } from "@/lib/public-seo";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalProfile } from "@/components/professional-profile";
import { ProfessionalProfileOpenSignal } from "@/components/professional-profile-open-signal";
import { BookingPicker } from "@/components/booking-picker";
import { BottomNavigation } from "@/components/bottom-navigation";
import { DiscoveryLiveStrip } from "@/components/discovery-live-strip";
import type { PublicStory } from "@/modules/stories/domain";
import type { LastMinuteSlot } from "@/modules/last-minute/domain";
import { withIdentity } from "@/lib/db";
import { publicProfile } from "@/modules/professionals/repository";
import { paymentReady } from "@/modules/payments/stripe";
import { followState } from "@/modules/follows/repository";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import type { Rule } from "@/modules/availability/domain";
import type { PolicyPreview } from "@/modules/policies/domain";
import { ProfessionalPolicySummary } from "@/components/professional-policy-summary";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug) || !process.env.DATABASE_URL)
    return { robots: { index: false, follow: false } };
  try {
    const profile = await withIdentity("", (db) => publicProfile(db, slug));
    if (!profile)
      return {
        title: "Professional unavailable",
        robots: { index: false, follow: false },
      };
    return publicMetadata(
      `/p/${slug}`,
      `${profile.professional.business_name} · ${profile.professional.city}`,
      profile.professional.bio.slice(0, 160),
    );
  } catch {
    return {
      title: "Professional profile",
      robots: { index: false, follow: false },
    };
  }
}

export default async function Profile({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    service?:string;speciality?:string;reviewService?:string;
    bookService?: string;
    bookPayment?: string;
    bookVariation?:string;bookExtras?:string;
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
    const bookingFeePence =
      (
        await db.query<{ fee: number }>(
          "SELECT beauty.public_booking_fee_pence() AS fee",
        )
      ).rows[0]?.fee ?? 100;
    const id = profile.professional.id;
    const policies=(await db.query<{id:string;policy:PolicyPreview}>("SELECT id,beauty.public_service_policy(id) AS policy FROM beauty.public_services WHERE professional_id=$1",[id])).rows;
    const access = (
      await db.query<{
        data: {
          status: "unverified" | "pending" | "verified" | "restricted";
          verified: boolean;
          paymentReady: boolean;
          starterBookingsUsed: number;
          starterBookingsRemaining: number | null;
        };
      }>("SELECT beauty.professional_access_state($1) AS data", [id])
    ).rows[0].data;
    const assets = (
      await db.query<{
        id: string;
        alt_text: string;
        media_type: "image" | "video";speciality_ids:string[];speciality_names:string[];
      }>(
        `SELECT a.id,a.alt_text,a.media_type,ARRAY(SELECT speciality_id FROM beauty.public_portfolio_specialities WHERE asset_id=a.id) AS speciality_ids,ARRAY(SELECT speciality_name FROM beauty.public_portfolio_specialities WHERE asset_id=a.id) AS speciality_names FROM beauty.public_media_assets a WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [id],
      )
    ).rows;
    const reviews = (
      await db.query<{
        id: string;
        rating: number;
        body: string;
        public_name: string;service_id:string|null;service_name:string|null;speciality_id:string|null;speciality_name:string|null;
      }>(
        "SELECT id,rating,body,public_name,service_id,service_name,speciality_id,speciality_name FROM beauty.public_reviews WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 50",
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
    const stories = (
      await db.query<PublicStory>(
        "SELECT * FROM beauty.public_stories WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 20",
        [id],
      )
    ).rows;
    const lastMinute = (
      await db.query<LastMinuteSlot>(
        "SELECT * FROM beauty.public_last_minute_slots WHERE professional_id=$1 ORDER BY starts_at ASC LIMIT 12",
        [id],
      )
    ).rows;
    const presentation = (
      await db.query<{
        profile_style: "signature" | "minimal" | "editorial";
        portfolio_layout: "grid" | "feature";
        service_style: "cards" | "clean";
      }>(
        `SELECT profile_style,portfolio_layout,service_style
         FROM beauty.public_profile_presentation
         WHERE professional_id=$1`,
        [id],
      )
    ).rows[0] ?? {
      profile_style: "signature" as const,
      portfolio_layout: "grid" as const,
      service_style: "cards" as const,
    };
    return {
      ...profile,
      policies,
      assets,
      reviews,
      hours,
      stats,
      follow,
      signedIn: Boolean(viewer),
      countCustomerOpen: Boolean(viewer?.roles.includes("customer")),
      bookingFeePence,
      stories,
      lastMinute,
      presentation,
      access,
      messageHref: viewer?.roles.includes("customer")
        ? `/messages?professional=${id}`
        : viewer
          ? null
          : `/sign-in?returnTo=${encodeURIComponent(`/messages?professional=${id}`)}`,
    };
  });
  if (!data) notFound();
  const focusService=data.services.find(s=>s.id===(booking.service||booking.bookService));
  const selectedSpeciality=focusService?.speciality_id??(data.specialities.some(s=>s.speciality_id===booking.speciality)?booking.speciality:null);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "BeautySalon",
            name: data.professional.business_name,
            description: data.professional.bio,
            url: `${publicOrigin}/p/${slug}`,
            address: {
              "@type": "PostalAddress",
              addressLocality: data.professional.city,
            },
            ...(data.stats.count && data.stats.rating
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: data.stats.rating,
                    reviewCount: data.stats.count,
                  },
                }
              : {}),
            hasOfferCatalog: {
              "@type": "OfferCatalog",
              name: "Beauty services",
              itemListElement: data.services.map((service) => ({
                "@type": "Offer",
                price: (service.price_pence / 100).toFixed(2),
                priceCurrency: "GBP",
                itemOffered: { "@type": "Service", name: service.name },
              })),
            },
          }),
        }}
      />
      {data.countCustomerOpen && <ProfessionalProfileOpenSignal professionalId={data.professional.id} />}
      <PublicHeader />
      <ProfessionalProfile
        professional={data.professional}
        policies={<section id="professional-policies" className="professional-section"><h2>Rules & booking policies</h2><p>Choose a service to inspect its applicable general and service-specific terms before booking.</p>{data.policies.map(p=><details key={p.id}><summary>{data.services.find(s=>s.id===p.id)?.name}</summary><ProfessionalPolicySummary policy={p.policy}/></details>)}</section>}
        details={data.details}
        services={data.services}
        specialities={data.specialities} selectedSpeciality={selectedSpeciality} selectedService={booking.service} reviewService={booking.reviewService}
        assets={data.assets}
        reviews={data.reviews}
        hours={data.hours}
        rating={data.stats.rating}
        reviewCount={data.stats.count}
        follow={{ ...data.follow, signedIn: data.signedIn }}
        messageHref={data.messageHref}
        bookingFeePence={data.bookingFeePence}
        presentation={data.presentation}
        live={
          <DiscoveryLiveStrip
            stories={data.stories}
            lastMinute={data.lastMinute}
          />
        }
        booking={
          <BookingPicker
            services={data.services}
            ready={paymentReady()}
            returnPath={`/p/${slug}`}
            professionalName={data.professional.business_name}
            bookingFeePence={data.bookingFeePence}
            verificationStatus={data.access.status}
            starterBookingsRemaining={data.access.starterBookingsRemaining}
            initialSelection={{
              serviceId: booking.bookService||booking.service,
              paymentChoice: booking.bookPayment === "full" || booking.bookPayment === "deposit" ? booking.bookPayment : "auto",
              variationId:booking.bookVariation,extraIds:booking.bookExtras?.split(",").slice(0,10),
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
