import {ContentReportButton} from "@/components/content-report-button";
import { PlatformLabel } from "./platform-labels";
import { ProfessionalDirections } from "./professional-directions";
import Link from "next/link";
import { ProfessionalVerificationBadges } from "./professional-verification-badges";
import { FollowProfessionalButton } from "./follow-professional-button";
import { ViewportVideo } from "./viewport-video";
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
  MessageCircle,
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
  specialities?:{speciality_id:string;name:string;category_name:string;is_primary:boolean}[];selectedSpeciality?:string|null;selectedService?:string;reviewService?:string;
  assets: { id: string; alt_text: string; media_type?: "image" | "video";speciality_ids?:string[];speciality_names?:string[] }[];
  reviews: { id: string; rating: number; body: string; public_name: string;photo_id?:string;photo_alt?:string;response_body?:string|null;service_id?:string|null;service_name?:string|null;speciality_id?:string|null;speciality_name?:string|null }[];
  hours: Rule[];
  rating: number | null;
  reviewCount: number;
  booking: ReactNode;
  live?: ReactNode;
  policies?: ReactNode;
  socialPortfolio?: ReactNode;
  ourWork?: ReactNode;
  follow: { following: boolean; followerCount: number; signedIn: boolean };
  messageHref: string | null;
  bookingFeePence: number;
  presentation: {
    profile_style: "signature" | "minimal" | "editorial";
    portfolio_layout: "grid" | "feature";
    service_style: "cards" | "clean";
  };
  example?: { basePath: string; mediaSources: Record<string, string> };
};
export function ProfessionalProfile({
  professional: p,
  details: d,
  services:allServices,
  assets:allAssets,
  reviews:allReviews,
  specialities=[],selectedSpeciality=null,selectedService,reviewService,
  hours,
  rating,
  reviewCount,
  booking,
  live,
  policies,
  socialPortfolio,
  ourWork,
  follow,
  messageHref,
  bookingFeePence,
  presentation,
  example,
}: ProfilePresentation) {
  const profilePath = example?.basePath ?? `/p/${p.slug}`;
  const mediaSource = (id: string) => example?.mediaSources[id] ?? `/api/media/${id}`;
  const services=allServices.filter(s=>!selectedSpeciality||s.speciality_id===selectedSpeciality).sort((a,b)=>(a.speciality_name??"Other services").localeCompare(b.speciality_name??"Other services")||a.price_pence-b.price_pence);
  const assets=allAssets.filter(a=>!selectedSpeciality||a.speciality_ids?.includes(selectedSpeciality));
  const reviews=allReviews.filter(r=>(!selectedSpeciality||r.speciality_id===selectedSpeciality)&&(!reviewService||r.service_id===reviewService));
  const specialityTabs=(anchor:string)=><nav className="taxonomy-tabs" aria-label={`${anchor} specialities`}><Link aria-current={!selectedSpeciality?"page":undefined} href={`${profilePath}#${anchor}`}>All {anchor==="services"?"Services":anchor}</Link>{specialities.map(s=><Link key={s.speciality_id} aria-current={selectedSpeciality===s.speciality_id?"page":undefined} href={`?speciality=${s.speciality_id}#${anchor}`}>{s.name}</Link>)}</nav>;
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
    <main
      id="main"
      className={`professional-public profile-style-${presentation.profile_style} service-style-${presentation.service_style}`}
    >
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
              src={mediaSource(d.photo_id)}
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
          {!!specialities.length&&<p>{specialities.map(s=>s.name).join(" · ")}<small className="professional-verification-note">Specialities declared by the professional.</small></p>}
          <div className="professional-meta">
            {example ? <span className="professional-card-verification">Example profile</span> : <ProfessionalVerificationBadges professional={p} />}
            <span>
              <MapPin size={16} aria-hidden />
              {p.city}
            </span>
            <a href="#reviews">
              <Star size={16} aria-hidden />
              {rating === null
                ? "No reviews yet"
                : `${rating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`}
            </a>
          </div>
          {p.verification_status === "verified" && (
            <small className="professional-verification-note">
              Identity verification confirms the professional completed GLOHAUS
              identity/payment checks. It is not an endorsement or guarantee of
              service quality.
            </small>
          )}
          <p className="professional-bio">{p.bio}</p>
          <div className="professional-social-actions">
            {example ? <span>Profile customisation example</span> : <FollowProfessionalButton
              professionalId={p.id}
              initialFollowing={follow.following}
              initialFollowerCount={follow.followerCount}
              signedIn={follow.signedIn}
            />}
            {messageHref && (
              <a className="professional-message-button" href={messageHref}>
                <MessageCircle size={16} aria-hidden />
                Message
              </a>
            )}
          </div>
        </div>
        <a className="button professional-book-button" href="#booking">
          {example ? "Preview appointment" : "Book an appointment"} <ArrowUpRight size={18} aria-hidden />
        </a>
      </header>
      {live}
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
                  {p.city}
                </p>
                {p.public_location_confirmed_at &&
                  p.public_latitude != null &&
                  p.public_longitude != null && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${p.public_latitude}&mlon=${p.public_longitude}#map=18/${p.public_latitude}/${p.public_longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View professional-confirmed studio pin
                    </a>
                  )}
                {!example && <ProfessionalDirections professional={p} />}
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
                  <p>{example ? "Example business · Contact details are not active." : "Choose a service and book through GLOHAUS."}</p>
                )}
              </div>
            </div>
            {!!socials.length && (
              <div className="professional-socials">…2245 tokens truncated…account for time off and existing bookings.
            </small>
          </section>
        </aside>
      </div>
    </main>
  );
}
