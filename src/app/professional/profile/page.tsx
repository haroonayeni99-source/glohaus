export const dynamic = "force-dynamic";

import Link from "next/link";
import { ConnectButton } from "@/components/connect-button";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalEditor } from "@/components/professional-editor";
import { ProfessionalProfileCustomization } from "@/components/professional-profile-customization";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import type { ProfileInput, Service } from "@/modules/professionals/domain";
export default async function EditProfile() {
  const result = await pageAccount("professional");
  if (result.error)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account!;
  const data = await withIdentity(account.authId, async (db) => {
    const profile = (
      await db.query<{
        business_description: string;
        location_details: string;
        contact_preference: NonNullable<ProfileInput["contactPreference"]>;
        contact_email: string;
        contact_phone: string;
        instagram_url: string;
        tiktok_url: string;
        website_url: string;
        slug: string | null;
        business_name: string;
        bio: string;
        city: string;
        category: ProfileInput["category"];
        publication_status: ProfileInput["publicationStatus"];
      }>(
        "SELECT business_description,location_details,contact_preference,contact_email,contact_phone,instagram_url,tiktok_url,website_url,slug,business_name,bio,city,category,publication_status FROM beauty.professional_profiles WHERE id=$1",
        [account.professionalId],
      )
    ).rows[0];
    const services = (
      await db.query<Service>(
        "SELECT * FROM beauty.services WHERE professional_id=$1 ORDER BY created_at,id",
        [account.professionalId],
      )
    ).rows;
    const photo =
      (
        await db.query<{ id: string; alt_text: string }>(
          "SELECT id,alt_text FROM beauty.profile_photos WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0] ?? null;
    const assets = (
      await db.query<{ id: string; alt_text: string }>(
        "SELECT id,alt_text FROM beauty.portfolio_assets WHERE professional_id=$1 ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows;
    const pricing = (
      await db.query<{
        data: { planKey: "starter" | "pro" | "premium" };
      }>("SELECT beauty.my_professional_pricing() AS data")
    ).rows[0].data;
    const presentation = (
      await db.query<{
        profile_style: "signature" | "minimal" | "editorial";
        portfolio_layout: "grid" | "feature";
        service_style: "cards" | "clean";
      }>(
        `SELECT profile_style,portfolio_layout,service_style
         FROM beauty.professional_profile_presentation
         WHERE professional_id=$1`,
        [account.professionalId],
      )
    ).rows[0];
    return { profile, services, photo, assets, pricing, presentation };
  });
  if (!data.profile)
    return (
      <div className="standalone-message">
        <AccessMessage code="FORBIDDEN" />
      </div>
    );
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link className="pro-back-link" href="/professional">← Dashboard</Link>
        <p className="pro-kicker">YOUR PROFESSIONAL PAGE</p>
        <h1>Build your digital beauty storefront.</h1>
        <p className="pro-page-lead">
          Introduce yourself and make your service menu easy to explore.
        </p>
        <div className="pro-management-actions">
          <Link
            className="pro-preview-button"
            href={
              data.profile.publication_status === "published" && data.profile.slug
                ? `/p/${data.profile.slug}`
                : "/professional-preview"
            }
            target={data.profile.publication_status === "published" && data.profile.slug ? "_blank" : undefined}
          >
            {data.profile.publication_status === "published" && data.profile.slug
              ? "Preview your live page ↗"
              : "See the GLOHAUS PRO page layout ↗"}
          </Link>
          <span>
            {data.profile.publication_status === "published"
              ? "Your public changes are visible to customers."
              : "Publish your page when the profile, a service and availability are ready."}
          </span>
        </div>
        <section className="pro-editor-surface">
          <ProfilePhotoEditor
            photo={data.photo}
            published={data.profile.publication_status === "published"}
          />
          <ProfessionalProfileCustomization
            planKey={data.pricing.planKey}
            initial={{
              profileStyle: data.presentation?.profile_style ?? "signature",
              portfolioLayout: data.presentation?.portfolio_layout ?? "grid",
              serviceStyle: data.presentation?.service_style ?? "cards",
            }}
          />
          <div className="profile-editor-links">
            <Link href="/professional/availability">
              Edit opening hours & time off →
            </Link>
            <Link href="/professional/services">Manage services & prices →</Link>
            <Link href="/professional/portfolio">Manage portfolio →</Link>
          </div>
          <ProfessionalEditor
            section="profile"
            initial={{
              businessDescription: data.profile.business_description,
              locationDetails: data.profile.location_details,
              contactPreference: data.profile.contact_preference,
              contactEmail: data.profile.contact_email,
              contactPhone: data.profile.contact_phone,
              instagramUrl: data.profile.instagram_url,
              tiktokUrl: data.profile.tiktok_url,
              websiteUrl: data.profile.website_url,
              slug: data.profile.slug || "",
              businessName: data.profile.business_name,
              bio: data.profile.bio,
              city: data.profile.city,
              category: data.profile.category,
              publicationStatus: data.profile.publication_status,
            }}
            services={data.services}
            assets={data.assets}
          />
          <ConnectButton />
        </section>
      </main>
    </div>
  );
}
