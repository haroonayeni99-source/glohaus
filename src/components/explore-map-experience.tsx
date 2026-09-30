import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  ChevronDown,
  Heart,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import type { PublicProfessional } from "@/modules/professionals/domain";

const areas = [
  { name: "All London", street: "Across the city", className: "london" },
  { name: "Peckham", street: "Rye Lane", className: "peckham" },
  { name: "Brixton", street: "Brixton Road", className: "brixton" },
  { name: "Shoreditch", street: "Redchurch Street", className: "shoreditch" },
  { name: "Soho", street: "Carnaby Street", className: "soho" },
  { name: "Camden", street: "Camden High Street", className: "camden" },
  { name: "Notting Hill", street: "Portobello Road", className: "notting-hill" },
  { name: "Greenwich", street: "Greenwich High Road", className: "greenwich" },
];

const serviceFilters = [
  "All Services",
  "Hair",
  "Braids",
  "Nails",
  "Barber",
  "Lashes",
  "Brows",
  "Makeup",
  "Waxing",
  "Injectables",
];

const clusters = [
  { name: "Camden", pos: "map-cluster-camden" },
  { name: "Notting Hill", pos: "map-cluster-notting" },
  { name: "Soho", pos: "map-cluster-soho" },
  { name: "Shoreditch", pos: "map-cluster-shoreditch" },
  { name: "Brixton", pos: "map-cluster-brixton" },
  { name: "Peckham", pos: "map-cluster-peckham" },
  { name: "Greenwich", pos: "map-cluster-greenwich" },
];

function ratingText(pro: PublicProfessional) {
  if (pro.rating == null) return "New";
  return `${pro.rating.toFixed(1)} (${pro.review_count ?? 0})`;
}

export function ExploreMapExperience({
  professionals,
  query,
}: {
  professionals: PublicProfessional[];
  query: string;
}) {
  const nearby = professionals.slice(0, 6);

  return (
    <div className="map-explore-page">
      <section className="map-explore-hero">
        <div className="map-explore-title-row">
          <div>
            <h1>
              Find Beauty Professionals <em>Near You</em>
            </h1>
            <p>Explore by borough, area or street and book trusted professionals.</p>
          </div>
          <form className="map-explore-search" role="search">
            <Search size={20} aria-hidden />
            <label htmlFor="map-search" className="sr-only">
              Search by area, borough, street, service or professional
            </label>
            <input
              id="map-search"
              name="q"
              defaultValue={query}
              placeholder="Search area, borough, street or service..."
              maxLength={100}
            />
            <button type="submit" aria-label="Search">
              <LocateFixed size={18} aria-hidden />
            </button>
          </form>
        </div>

        <div className="map-area-strip" aria-label="Explore London areas">
          {areas.map((area) => (
            <Link
              key={area.name}
              href={area.name === "All London" ? "/explore" : `/explore?q=${encodeURIComponent(area.name)}`}
              className={`map-area-card ${area.className}`}
            >
              <span>{area.name}</span>
              <small>{area.street}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="map-filter-shell" aria-label="Discovery filters">
        <div className="map-service-filters">
          {serviceFilters.map((filter, index) => (
            <Link
              key={filter}
              href={filter === "All Services" ? "/explore" : `/explore?q=${encodeURIComponent(filter)}`}
              className={index === 0 ? "active" : undefined}
            >
              {filter}
              {index === 0 && <ChevronDown size={14} aria-hidden />}
            </Link>
          ))}
        </div>
        <div className="map-secondary-filters">
          <span>Available today</span>
          <span><BadgeCheck size={15} aria-hidden /> Verified only</span>
          <span>Travels to you</span>
          <span>Under £50</span>
          <span><Star size={15} aria-hidden /> Top rated</span>
          <button type="button">
            <SlidersHorizontal size={16} aria-hidden /> More filters
          </button>
        </div>
      </section>

      <section className="map-results-layout">
        <div className="glohaus-map" aria-label="Stylised London beauty discovery map">
          <div className="map-road map-road-a" />
          <div className="map-road map-road-b" />
          <div className="map-road map-road-c" />
          <div className="map-river" />
          <span className="map-city-label">London</span>
          <span className="map-borough-label map-label-hackney">HACKNEY</span>
          <span className="map-borough-label map-label-westminster">WESTMINSTER</span>
          <span className="map-borough-label map-label-lewisham">LEWISHAM</span>

          <div className="map-controls">
            <button type="button" aria-label="Zoom in">+</button>
            <button type="button" aria-label="Zoom out">−</button>
            <button type="button" aria-label="Use my location"><LocateFixed size={17} /></button>
          </div>

          {clusters.map((cluster) => (
            <Link
              key={cluster.name}
              className={`map-cluster ${cluster.pos}`}
              href={`/explore?q=${encodeURIComponent(cluster.name)}`}
            >
              <strong>{cluster.name}</strong>
              <small>Explore area</small>
            </Link>
          ))}

          <div className="map-street-card">
            <div className="map-street-thumb"><MapPin size={24} aria-hidden /></div>
            <div>
              <strong>Rye Lane, Peckham</strong>
              <span>Beauty professionals nearby</span>
              <Link href="/explore?q=Peckham">View this area →</Link>
            </div>
          </div>

          <div className="map-legend">
            <span><i className="dot" /> Professional</span>
            <span><i className="bubble" /> Area cluster</span>
            <span><i className="square" /> Borough area</span>
          </div>
        </div>

        <aside className="map-pro-results">
          <div className="map-pro-heading">
            <div>
              <h2>{query ? `Professionals for “${query}”` : "Professionals near London"}</h2>
              <p>{professionals.length ? `${professionals.length} matching profiles` : "Discover independent beauty talent"}</p>
            </div>
          </div>

          {nearby.length ? (
            <div className="map-pro-list">
              {nearby.map((pro) => (
                <article className="map-pro-row" key={pro.id}>
                  <Link href={`/p/${pro.slug}`} className="map-pro-avatar" aria-label={pro.business_name}>
                    {pro.photo_id ? (
                      <Image
                        src={`/api/media/${pro.photo_id}`}
                        alt={pro.photo_alt || pro.business_name}
                        fill
                        sizes="76px"
                        unoptimized
                      />
                    ) : (
                      <span>{pro.business_name.slice(0, 1)}</span>
                    )}
                  </Link>
                  <div className="map-pro-copy">
                    <Link href={`/p/${pro.slug}`} className="map-pro-name">
                      {pro.business_name}
                    </Link>
                    <span className="map-pro-rating">
                      <Star size={13} fill="currentColor" aria-hidden /> {ratingText(pro)}
                    </span>
                    <div className="map-pro-tags">
                      <span>{pro.category}</span>
                      <span>{pro.city}</span>
                      {pro.verification_status === "verified" && <span>Verified</span>}
                    </div>
                  </div>
                  <button type="button" className="map-heart" aria-label={`Save ${pro.business_name}`}>
                    <Heart size={18} aria-hidden />
                  </button>
                  <Link className="map-book-button" href={`/p/${pro.slug}`}>
                    Book
                  </Link>
                </article>
              ))}
              <Link className="map-view-all" href={query ? `/explore?q=${encodeURIComponent(query)}` : "/explore"}>
                View all professionals in this area →
              </Link>
            </div>
          ) : (
            <div className="map-pro-empty">
              <Sparkles size={28} aria-hidden />
              <h3>No matching professionals yet.</h3>
              <p>Try another area or service while the GLOHAUS directory grows.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
