export const dynamic = "force-dynamic";

import Link from "next/link";
import { ConnectButton } from "@/components/connect-button";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalEditor } from "@/components/professional-editor";
import { PublicHeader } from "@/components/public-header";
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
    return { profile, services, photo, assets };
  });
  if (!data.profile)
    return (
      <div className="standalone-message">
        <AccessMessage code="FORBIDDEN" />
      </div>
    );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link className="back-link" href="/professional">
          ← Your workspace
        </Link>
        <p className="eyebrow">YOUR PROFESSIONAL PAGE</p>
        <h1>
          A home for <em>your craft.</em>
        </h1>
        <p className="lead">
          Introduce yourself and make your service menu easy to explore.
        </p>
        <ProfilePhotoEditor
          photo={data.photo}
          published={data.profile.publication_status === "published"}
        />
        <div className="profile-editor-links">
          <Link href="/professional/availability">
            Edit opening hours & time off →
          </Link>
          <Link href="/professional/portfolio">Manage portfolio →</Link>
        </div>
        <ProfessionalEditor
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
      </main>
    </>
  );
}
