import { PlatformLabel } from "./platform-labels";
import { ProfessionalVerificationBadges } from "./professional-verification-badges";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Star, ArrowUpRight, CalendarCheck2, Sparkles } from "lucide-react";
import { money, type PublicProfessional } from "@/modules/professionals/domain";
export function ProfessionalCard({
  professional: pro,
}: {
  professional: PublicProfessional;
}) {
  return (
    <Link className="professional-card" href={`/p/${pro.slug}`}>
      <div className="professional-card-visual">
        {pro.photo_id ? (
          <Image
            src={`/api/media/${pro.photo_id}`}
            alt={pro.photo_alt || pro.business_name}
            width={640}
            height={640}
            unoptimized
            loading="lazy"
          />
        ) : (
          <span className="professional-card-initial" aria-hidden>
            {pro.business_name.slice(0, 1)}
          </span>
        )}
        <span className="professional-category-badge">
          <PlatformLabel name={pro.category} />
        </span>
      </div>
      <div className="professional-card-copy">
        <h2>
          {pro.business_name}
          <ArrowUpRight size={20} aria-hidden />
        </h2>
        <div className="professional-card-meta">
          <span>
            <MapPin size={14} aria-hidden />
            {pro.city}
          </span>
          <span className={pro.available_today ? "is-available" : undefined}>
            <CalendarCheck2 size={14} aria-hidden />
            {pro.available_today ? "Available today" : "Check availability"}
          </span>
        </div>
        {pro.boosted && <span className="professional-featured-label">Featured · visibility boost</span>}
        <ProfessionalVerificationBadges professional={pro} />
        <p className="professional-card-bio">{pro.bio}</p>
        {!!pro.popular_services?.length && (
          <div className="professional-card-services" aria-label="Popular services">
            <Sparkles size={13} aria-hidden />
            {pro.popular_services.map((service) => <span key={service}>{service}</span>)}
          </div>
        )}
        <div className="professional-card-details">
          <span>
            <Star size={14} aria-hidden />
            {pro.rating == null
              ? "No reviews yet"
              : `${pro.rating.toFixed(1)} (${pro.review_count ?? 0})`}
          </span>
          {pro.from_price_pence != null && (
            <strong>From {money(pro.from_price_pence)}</strong>
          )}
        </div>
      </div>
    </Link>
  );
}
