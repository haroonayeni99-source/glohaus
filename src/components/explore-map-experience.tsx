"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
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
import type { DiscoveryFilters } from "@/modules/professionals/discovery";

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
  { name: "Camden", pos: "map-cluster-camden", lat: 51.539, lng: -0.143 },
  { name: "Notting Hill", pos: "map-cluster-notting", lat: 51.509, lng: -0.204 },
  { name: "Soho", pos: "map-cluster-soho", lat: 51.513, lng: -0.133 },
  { name: "Shoreditch", pos: "map-cluster-shoreditch", lat: 51.524, lng: -0.078 },
  { name: "Brixton", pos: "map-cluster-brixton", lat: 51.462, lng: -0.115 },
  { name: "Peckham", pos: "map-cluster-peckham", lat: 51.474, lng: -0.069 },
  { name: "Greenwich", pos: "map-cluster-greenwich", lat: 51.482, lng: 0.006 },
];

function ratingText(pro: PublicProfessional) {
  if (pro.rating == null) return "New";
  return `${pro.rating.toFixed(1)} (${pro.review_count ?? 0})`;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ExploreMapExperience({
  professionals,
  query,
  filters,
}: {
  professionals: PublicProfessional[];
  query: string;
  filters: DiscoveryFilters;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [locationNotice, setLocationNotice] = useState("");
  const [locating, setLocating] = useState(false);
  const nearby = professionals.slice(0, 6);
  const selected = query.trim().toLowerCase();
  const filterPairs = [
    ["verified", filters.verified],
    ["under50", filters.under50],
    ["topRated", filters.topRated],
    ["travels", filters.travels],
    ["today", filters.availableToday],
  ] as const;
  const hrefFor = (
    nextQuery = query,
    toggle?: (typeof filterPairs)[number][0],
  ) => {
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    for (const [key, active] of filterPairs) {
      const nextActive = key === toggle ? !active : active;
      if (nextActive) params.set(key, "1");
    }
    const value = params.toString();
    return value ? `/explore?${value}` : "/explore";
  };
  const anySecondaryFilter = filterPairs.some(([, active]) => active);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationNotice("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setLocationNotice("Checking your nearest GLOHAUS area…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = clusters
          .map((cluster) => ({
            ...cluster,
            distance: distanceKm(
              coords.latitude,
              coords.longitude,
              cluster.lat,
              cluster.lng,
            ),
          }))
          .sort((a, b) => a.distance - b.distance)[0];

        if (!nearest || nearest.distance > 35) {
          setLocationNotice(
            "You appear to be outside the current London discovery area.",
          );
          setLocating(false);
          return;
        }

        setLocationNotice(`Nearest area: ${nearest.name}`);
        setLocating(false);
        router.push(hrefFor(nearest.name));
      },
      () => {
        setLocationNotice(
          "Location permission was not granted. You can still search by area or street.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

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
            {filters.verified && <input type="hidden" name="verified" value="1" />}
            {filters.under50 && <input type="hidden" name="under50" value="1" />}
            {filters.topRated && <input type="hidden" name="topRated" value="1" />}
            {filters.travels && <input type="hidden" name="travels" value="1" />}
            {filters.availableToday && <input type="hidden" name="today" value="1" />}
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
              href={hrefFor(area.name === "All London" ? "" : area.name)}
              className={`map-area-card ${area.className} ${
                (area.name === "All London" && !selected) ||
                selected === area.name.toLowerCase() ||
                selected === area.street.toLowerCase()
                  ? "active"
                  : ""
              }`}
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
              href={hrefFor(filter === "All Services" ? "" : filter)}
              className={
                (index === 0 && !selected) || selected === filter.toLowerCase()
                  ? "active"
                  : undefined
              }
            >
              {filter}
              {index === 0 && <ChevronDown size={14} aria-hidden />}
            </Link>
          ))}
        </div>
        <div className="map-secondary-filters">
          <Link className={filters.availableToday ? "active" : undefined} href={hrefFor(query, "today")}>
            Available today
          </Link>
          <Link className={filters.verified ? "active" : undefined} href={hrefFor(query, "verified")}>
            <BadgeCheck size={15} aria-hidden /> Verified only
          </Link>
          <Link className={filters.travels ? "active" : undefined} href={hrefFor(query, "travels")}>
            Travels to you
          </Link>
          <Link className={filters.under50 ? "active" : undefined} href={hrefFor(query, "under50")}>
            Under £50
          </Link>
          <Link className={filters.topRated ? "active" : undefined} href={hrefFor(query, "topRated")}>
            <Star size={15} aria-hidden /> Top rated
          </Link>
          {anySecondaryFilter ? (
            <Link href={query ? `/explore?q=${encodeURIComponent(query)}` : "/explore"}>
              <SlidersHorizontal size={16} aria-hidden /> Clear filters
            </Link>
          ) : (
            <Link href="/explore?verified=1&topRated=1">
              <SlidersHorizontal size={16} aria-hidden /> Trusted picks
            </Link>
          )}
        </div>
      </section>

      <section className="map-results-layout">
        <div className="glohaus-map" aria-label="Stylised London beauty discovery map">
          <div
            className="map-canvas"
            style={{ "--map-scale": zoom } as CSSProperties}
          >
          <div className="map-road map-road-a" />
          <div className="map-road map-road-b" />
          <div className="map-road map-road-c" />
          <div className="map-river" />
          <span className="map-city-label">London</span>
          <span className="map-borough-label map-label-hackney">HACKNEY</span>
          <span className="map-borough-label map-label-westminster">WESTMINSTER</span>
          <span className="map-borough-label map-label-lewisham">LEWISHAM</span>

          </div>
          <div className="map-controls">
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom >= 1.35}
              onClick={() => setZoom((value) => Math.min(1.35, +(value + 0.1).toFixed(2)))}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom <= 0.85}
              onClick={() => setZoom((value) => Math.max(0.85, +(value - 0.1).toFixed(2)))}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Use my location"
              aria-busy={locating}
              onClick={useMyLocation}
            >
              <LocateFixed size={17} />
            </button>
          </div>
          {locationNotice && (
            <div className="map-location-notice" role="status">
              {locationNotice}
            </div>
          )}

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
              <Link href="/explore?q=Rye%20Lane">View this street →</Link>
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
                      {pro.travels_to_you && <span>Travels to you</span>}
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
