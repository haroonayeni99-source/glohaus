import { PlatformLabel } from "./platform-labels";
import Image from "next/image";
import {
  MapPin,
  Star,
  ArrowUpRight,
  Clock3,
  Instagram,
  Mail,
  Phone,
  Globe,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  money,
  type PublicProfessional,
  type ProfileDetails,
  type Service,
} from "@/modules/professionals/domain";
import { clockTime, days, type Rule } from "@/modules/availability/domain";
export type ProfilePresentation = {
  professional: PublicProfessional;
  details: ProfileDetails;
  services: Service[];
  assets: { id: string; alt_text: string }[];
  reviews: { id: string; rating: number; body: string; public_name: string }[];
  hours: Rule[];
  rating: number | null;
  reviewCount: number;
  booking: ReactNode;
};
export function ProfessionalProfile({
  professional: p,
  details: d,
  services,
  assets,
  reviews,
  hours,
  rating,
  reviewCount,
  booking,
}: ProfilePresentation) {
  const safeHref = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  const socials = [
    {
      name: "Instagram",
      url: safeHref(d.instagram_url),
      icon: <Instagram size={17} />,
    },
    {
      name: "TikTok",
      url: safeHref(d.tiktok_url),
      icon: <ArrowUpRight size={17} />,
    },
    {
      name: "Website",
      url: safeHref(d.website_url),
      icon: <Globe size={17} />,
    },
  ].filter((item) => item.url);
  return (
    <main id="main" className="professional-public">
      <div className="professional-cover">
        <span>INDEPENDENT BEAUTY. PERSONAL BY DESIGN.</span>
        <span aria-hidden>g.</span>
      </div>
      <header className="professional-hero">
        <div className="professional-portrait">
          {d.photo_id ? (
            <Image
              width={180}
              height={180}
              unoptimized
              src={`/api/media/${d.photo_id}`}
              alt={d.photo_alt || p.business_name}
              priority
            />
          ) : (
            <span aria-label={`${p.business_name} initials`}>
              {p.business_name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="professional-heading">
          <p className="eyebrow">
            <PlatformLabel name={p.category} /> · INDEPENDENT{" "}
            <PlatformLabel name="Professional" />
          </p>
          <h1>{p.business_name}</h1>
          <div className="professional-meta">
            <span>
              <MapPin size={16} aria-hidden />
              {p.city}, England
            </span>
            <a href="#reviews">
              <Star size={16} aria-hidden />
              {rating === null
                ? "No reviews yet"
                : `${rating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`}
            </a>
          </div>
          <p className="professional-bio">{p.bio}</p>
        </div>
        <a className="button professional-book-button" href="#booking">
          Book an appointment <ArrowUpRight size={18} aria-hidden />
        </a>
      </header>
      <nav className="profile-section-nav" aria-label="Profile sections">
        <a href="#about">About</a>
        <a href="#portfolio">Portfolio</a>
        <a href="#services">Services</a>
        <a href="#reviews">Reviews</a>
        <a href="#hours">Opening hours</a>
      </nav>
      <div className="professional-body">
        <div>
          <section id="about" className="professional-section">
            <p className="eyebrow">MEET YOUR PROFESSIONAL</p>
            <h2>A little about the business.</h2>
            <p className="profile-long-description">
              {d.business_description || p.bio}
            </p>
            <div className="professional-contact">
              <div>
                <h3>Find me</h3>
                <p>
                  <MapPin size={16} aria-hidden />{" "}
                  {d.location_details ? `${d.location_details}, ` : ""}
                  {p.city}, England
                </p>
              </div>
              <div>
                <h3>Get in touch</h3>
                {d.contact_preference === "email" && d.contact_email ? (
                  <a href={`mailto:${d.contact_email}`}>
                    <Mail size={16} aria-hidden />
                    {d.contact_email}
                  </a>
                ) : d.contact_preference === "phone" && d.contact_phone ? (
                  <a href={`tel:${d.contact_phone.replace(/[^+0-9]/g, "")}`}>
                    <Phone size={16} aria-hidden />
                    {d.contact_phone}
                  </a>
                ) : d.contact_preference === "instagram" &&
                  safeHref(d.instagram_url) ? (
                  <a
                    href={safeHref(d.instagram_url)!}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                  >
                    Contact on Instagram <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <p>Choose a service and book through GLOHAUS.</p>
                )}
              </div>
            </div>
            {!!socials.length && (
              <div className="professional-socials">
                {socials.map((item) => (
                  <a
                    key={item.name}
                    href={item.url!}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                  >
                    {item.icon}
                    {item.name}
                    <ArrowUpRight size={14} aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </section>
          <section id="portfolio" className="professional-section">
            <p className="eyebrow">THE WORK SPEAKS</p>
            <h2>A closer look.</h2>
            {assets.length ? (
              <div className="professional-gallery">
                {assets.map((asset) => (
                  <Image
                    key={asset.id}
                    src={`/api/media/${asset.id}`}
                    width={600}
                    height={750}
                    unoptimized
                    alt={asset.alt_text}
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <p className="profile-empty">
                Portfolio images are on their way.
              </p>
            )}
          </section>
          <section id="services" className="professional-section">
            <p className="eyebrow">MAKE A LITTLE TIME FOR YOU</p>
            <h2>Services & prices.</h2>
            <div className="service-list">
              {services.map((service) => (
                <article
                  key={service.id}
                  className={
                    service.asset_id ? "service-with-image" : undefined
                  }
                >
                  {service.asset_id && (
                    <Image
                      src={`/api/media/${service.asset_id}`}
                      alt={service.image_alt || service.name}
                      width={96}
                      height={96}
                      unoptimized
                      style={{
                        objectFit: "cover",
                        borderRadius: 12,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                    <span>
                      <Clock3 size={14} aria-hidden />
                      {service.duration_minutes} minutes
                    </span>
                  </div>
                  <div className="profile-service-price">
                    <strong>{money(service.price_pence)}</strong>
                    <a className="text-link" href="#booking">
                      Availability <ArrowUpRight size={14} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
            {!services.length && (
              <p className="profile-empty">
                The service menu is being prepared.
              </p>
            )}
          </section>
          <section id="reviews" className="professional-section">
            <p className="eyebrow">REAL VISITS. REAL EXPERIENCES.</p>
            <h2>Kind words.</h2>
            {rating !== null && (
              <p className="profile-rating-summary">
                <Star size={20} aria-hidden />
                <strong>{rating.toFixed(1)} / 5</strong> from {reviewCount}{" "}
                verified {reviewCount === 1 ? "review" : "reviews"}
              </p>
            )}
            {reviews.length ? (
              reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <strong>
                    {review.public_name} · {review.rating}/5
                  </strong>
                  <p>{review.body}</p>
                  <small>Verified completed appointment</small>
                </article>
              ))
            ) : (
              <p className="profile-empty">
                No reviews yet. Reviews appear after completed appointments.
              </p>
            )}
          </section>
        </div>
        <aside className="professional-aside">
          <section
            id="booking"
            className="professional-section booking-anchor"
            aria-label="Book an appointment"
          >
            {services.length ? (
              booking
            ) : (
              <div className="booking-widget">
                <h2>Appointments, coming soon.</h2>
                <p>This professional has not published services yet.</p>
              </div>
            )}
          </section>
          <section id="hours" className="professional-section hours-card">
            <p className="eyebrow">PLAN YOUR VISIT</p>
            <h2>Opening hours.</h2>
            {hours.length ? (
              <dl>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const rule = hours.find((r) => r.weekday === day);
                  return (
                    <div key={day}>
                      <dt>{days[day]}</dt>
                      <dd>
                        {rule
                          ? `${clockTime(rule.startMinute)} – ${rule.endMinute === 1440 ? "Midnight" : clockTime(rule.endMinute)}`
                          : "Closed"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p>Opening hours have not been added yet.</p>
            )}
            <small>
              London time · Adjusts for British Summer Time. Available
              appointments also account for time off and existing bookings.
            </small>
          </section>
        </aside>
      </div>
    </main>
  );
}
