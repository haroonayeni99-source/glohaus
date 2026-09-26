import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfessionalProfile } from "../../src/components/professional-profile";
import { ProfessionalEditor } from "../../src/components/professional-editor";
import { ProfilePhotoEditor } from "../../src/components/profile-photo-editor";
import { AvailabilityEditor } from "../../src/components/availability-editor";
const profile = {
  id: "studio-test",
  slug: "maya-studio",
  business_name: "Maya Nail Atelier",
  bio: "Thoughtful nail artistry, a slower pace, and a little space just for you.",
  city: "London",
  category: "Nails" as const,
};
const details = {
  id: "studio-test",
  business_description:
    "A quiet corner of Shoreditch, made for beautiful nails and a moment to yourself.\n\nI specialise in natural nail care, soft gel finishes and tiny details with personality. Every appointment starts with a conversation about your style.",
  location_details: "Shoreditch",
  contact_preference: "email" as const,
  contact_email: "hello@example.test",
  contact_phone: "",
  instagram_url: "https://www.instagram.com/example",
  tiktok_url: "",
  website_url: "https://example.test",
  photo_id: "portrait",
  photo_alt: "Test studio monogram",
};
const services = [
  {
    id: "service-test",
    professional_id: "studio-test",
    name: "Signature gel manicure",
    description:
      "Thoughtful preparation, shaping and your choice of gel colour.",
    duration_minutes: 60,
    price_pence: 4500,
    deposit_pence: 0,
  },
];
const initial = {
  slug: profile.slug,
  businessName: profile.business_name,
  bio: profile.bio,
  city: profile.city,
  category: profile.category,
  publicationStatus: "draft" as const,
  businessDescription: details.business_description,
  locationDetails: details.location_details,
  contactPreference: details.contact_preference,
  contactEmail: details.contact_email,
  contactPhone: "",
  instagramUrl: details.instagram_url,
  tiktokUrl: "",
  websiteUrl: details.website_url,
};
export function preview(editor = false) {
  return renderToStaticMarkup(
    <>
      <div className="profile-test-banner">
        ISOLATED VISUAL TEST · FICTIONAL DATA · NOT A BOOKABLE PROFESSIONAL
      </div>
      {editor ? (
        <main id="main" className="catalog-page">
          <h1>Your professional profile.</h1>
          <ProfilePhotoEditor photo={null} published={false} />
          <ProfessionalEditor initial={initial} services={services} />
          <AvailabilityEditor
            initial={[{ weekday: 1, startMinute: 540, endMinute: 1020 }]}
          />
        </main>
      ) : (
        <ProfessionalProfile
          professional={profile}
          details={details}
          services={services}
          assets={[
            {
              id: "design-one",
              alt_text: "Test image: soft rose nail colour palette",
            },
            {
              id: "design-two",
              alt_text: "Test image: berry nail colour palette",
            },
            {
              id: "design-three",
              alt_text: "Test image: warm cream nail colour palette",
            },
          ]}
          reviews={[
            {
              id: "review-test",
              rating: 5,
              body: "Test review text to verify the review layout. This is not a real customer review.",
              public_name: "Test customer",
            },
          ]}
          hours={[1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startMinute: 540,
            endMinute: 1020,
          }))}
          rating={5}
          reviewCount={1}
          follow={{ following: false, followerCount: 0, signedIn: false }}
          messageHref={null}
          bookingFeePence={100}
          booking={
            <section className="booking-widget">
              <p className="eyebrow">YOUR NEXT BEAUTY MOMENT</p>
              <h2>Make time for you.</h2>
              <label>
                Choose a service
                <select>
                  <option>Signature gel manicure · £45.00</option>
                </select>
              </label>
              <label>
                Date
                <input type="date" />
              </label>
              <button className="button small" disabled>
                See available times
              </button>
              <p>Visual test only. No appointments or payments.</p>
            </section>
          }
        />
      )}
    </>,
  );
}
