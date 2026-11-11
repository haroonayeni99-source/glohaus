import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfessionalProfile } from "@/components/professional-profile";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import {
  findProfileExample,
} from "@/modules/professionals/examples";
import { money } from "@/modules/professionals/domain";
import { publicBookingFees } from "@/modules/bookings/public-fees";
import "@/components/profile-examples.css";
import { publicExampleVisibility } from "@/modules/professionals/example-visibility-repository";
import { visibleProfileExamples } from "@/modules/professionals/example-visibility";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = findProfileExample((await params).slug);
  const visible = visibleProfileExamples(await publicExampleVisibility());
  return {
    title: p && visible.includes(p) ? `${p.name} · Example profile` : "Example profile unavailable",
    robots: { index: false, follow: false },
  };
}

export default async function ExampleProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ speciality?: string; service?: string }>;
}) {
  const p = findProfileExample((await params).slug);
  const visible = visibleProfileExamples(await publicExampleVisibility());
  if (!p || !visible.includes(p)) notFound();
  const query = await searchParams;
  const selected =
    p.services.find((s) => s.id === query.service) ?? p.services[0];
  const speciality = p.specialities.some(
    (s) => s.speciality_id === query.speciality,
  )
    ? query.speciality
    : undefined;
  const signedIn = await publicViewerSignedIn();
  const fees = await publicBookingFees();
  const exampleFee = fees?.standardFeePence ?? 150;
  const next =
    visible[(visible.indexOf(p) + 1) % visible.length];
  return (
    <>
      <PublicHeader signedIn={signedIn} />
      <div className="profile-example-banner" role="note">
        <div>
          <strong>EXAMPLE PROFILE · FICTIONAL BUSINESS</strong>
          <p>
            Illustrative prices, hours, policies and imagery. No real
            appointments, messages, reviews or payments.
          </p>
          <p>
            {p.style.profile_style} profile ·{" "}
            {p.style.portfolio_layout === "feature"
              ? "Featured portfolio"
              : "Portfolio grid"}{" "}
            ·{" "}
            {p.style.service_style === "clean"
              ? "Clean service list"
              : "Service cards"}
          </p>
        </div>
        <nav aria-label="Example profiles">
          <Link href="/profile-examples">{visible.length === 10 ? "All ten examples" : "All available examples"}</Link>
          <Link href={next.path}>Next example →</Link>
        </nav>
      </div>
      <ProfessionalProfile
        professional={p.professional}
        details={p.details}
        services={p.services}
        specialities={p.specialities}
        selectedSpeciality={speciality}
        selectedService={query.service}
        assets={p.assets}
        reviews={[]}
        hours={p.hours}
        rating={null}
        reviewCount={0}
        follow={{ following: false, followerCount: 0, signedIn: false }}
        messageHref={null}
        bookingFeePence={exampleFee}
        presentation={p.style}
        example={{ basePath: p.path, mediaSources: p.mediaSources }}
        policies={
          <section className="professional-section" id="professional-policies">
            <p className="eyebrow">SET EXPECTATIONS CLEARLY</p>
            <h2>Example rules & booking policies.</h2>
            <p>
              A real professional can publish their own permitted general and
              service-specific policies. These examples create no agreement or
              charge.
            </p>
            <dl className="profile-example-policies">
              {p.policies.map(([title, body]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
          </section>
        }
        booking={
          <div className="booking-widget profile-example-booking">
            <p className="eyebrow">APPOINTMENT PREVIEW</p>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <p>
              <strong>
                {money(selected.price_pence + exampleFee)} illustrative total
              </strong>
              <br />
              Service {money(selected.price_pence)} + example booking fee {money(exampleFee)}. Live fees and any eligible referral offer are confirmed before booking.
            </p>
            <p>
              {selected.duration_minutes} minutes ·{" "}
              {selected.deposit_pence
                ? `${money(selected.deposit_pence)} example deposit`
                : "No example deposit"}
            </p>
            {!!selected.options?.length && (
              <div>
                <h3>Example optional extras</h3>
                {selected.options.map((o) => (
                  <p key={o.id}>
                    {o.name} · {money(o.pricePence)} · {o.durationMinutes}{" "}
                    minutes
                  </p>
                ))}
              </div>
            )}
            <p>
              No live appointment times are offered. Real booking availability
              comes from the professional’s calendar.
            </p>
            <Link
              className="button"
              href="/sign-up?intent=professional&returnTo=/professional/setup"
            >
              Build my own profile
            </Link>
            <Link href="/explore">Find real professionals</Link>
          </div>
        }
      />
      <BottomNavigation active="search" signedIn={signedIn} />
    </>
  );
}
