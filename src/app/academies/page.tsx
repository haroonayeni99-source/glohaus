import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-header";
import { publicViewerSignedIn } from "@/lib/public-viewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beauty academy partnerships | GLOHAUS",
  description:
    "Explore a possible GLOHAUS partnership for beauty training academies and newly qualified professionals.",
  robots: { index: false, follow: false },
};

const stages = [
  {
    heading: "Introduce your academy",
    detail:
      "Tell us which beauty qualifications and specialities you teach, where you operate, and how you support graduates.",
  },
  {
    heading: "Discuss a suitable pilot",
    detail:
      "We can review whether an optional graduate onboarding pilot is appropriate. No placement, approval or reward is guaranteed.",
  },
  {
    heading: "Graduates choose for themselves",
    detail:
      "Each adult professional uses their own GLOHAUS account and decides whether to join. An academy introduction does not bypass verification or service eligibility.",
  },
] as const;

export default async function AcademyPartnershipsPage() {
  const signedIn = await publicViewerSignedIn();
  return (
    <>
      <PublicHeader signedIn={signedIn} />
      <main id="main" className="public-info-page">
        <section className="public-info-hero">
          <p className="eyebrow">GLOHAUS · ACADEMY PARTNERSHIPS</p>
          <h1>Help your beauty graduates take their next step</h1>
          <p>
            We are exploring ways for UK beauty training academies to introduce
            interested adult graduates to GLOHAUS, where they can set up their
            own professional pages, share their work and manage bookings.
          </p>
          <p>
            <Link href="/contact">Contact GLOHAUS about an academy pilot</Link>
          </p>
        </section>
        <section aria-labelledby="academy-process">
          <h2 id="academy-process">How a potential partnership could work</h2>
          <ol>
            {stages.map((stage) => (
              <li key={stage.heading}>
                <h3>{stage.heading}</h3>
                <p>{stage.detail}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="graduate-tools">
          <h2 id="graduate-tools">What graduates can explore</h2>
          <p>
            GLOHAUS already provides professional setup guidance covering
            services, working hours, portfolios, booking policies, personal
            booking links and business tools. Access to paid activity remains
            subject to normal platform requirements.
          </p>
          <p>
            <Link href="/professional/launch">Explore the professional launch guide</Link>
          </p>
        </section>
        <section aria-labelledby="academy-privacy">
          <h2 id="academy-privacy">Privacy and eligibility first</h2>
          <p>
            Please do not send student lists, private contact details or
            qualification documents through an initial enquiry. We do not
            automatically enrol graduates, create accounts on their behalf,
            guarantee professional verification, or award referral rewards for
            introductions alone.
          </p>
          <p>
            Academy cohorts, referral incentives and any formal partnership
            terms are subject to separate approval and are not available
            through this page.
          </p>
          <p>
            <Link href="/contact">Get in touch</Link> to discuss a possible pilot.
          </p>
        </section>
      </main>
    </>
  );
}
