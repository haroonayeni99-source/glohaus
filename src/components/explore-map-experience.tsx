"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ArrowUpRight,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import { GeographicMap } from "./geographic-map";
import {
  coordinatesSchema,
  distanceLabel,
  type Coordinates,
} from "@/modules/professionals/location";
import type { PublicProfessional } from "@/modules/professionals/domain";
import {
  discoveryHref,
  type DiscoveryFilters,
} from "@/modules/professionals/discovery";

const areas = [
  { name: "All London", street: "Across the city", className: "london" },
  { name: "Peckham", street: "Rye Lane", className: "peckham" },
  { name: "Brixton", street: "Brixton Road", className: "brixton" },
  { name: "Shoreditch", street: "Redchurch Street", className: "shoreditch" },
  { name: "Soho", street: "Carnaby Street", className: "soho" },
  { name: "Camden", street: "Camden High Street", className: "camden" },
  {
    name: "Notting Hill",
    street: "Portobello Road",
    className: "notting-hill",
  },
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
  {
    name: "Notting Hill",
    pos: "map-cluster-notting",
    lat: 51.509,
    lng: -0.204,
  },
  { name: "Soho", pos: "map-cluster-soho", lat: 51.513, lng: -0.133 },
  {
    name: "Shoreditch",
    pos: "map-cluster-shoreditch",
    lat: 51.524,
    lng: -0.078,
  },
  { name: "Brixton", pos: "map-cluster-brixton", lat: 51.462, lng: -0.115 },
  { name: "Peckham", pos: "map-cluster-peckham", lat: 51.474, lng: -0.069 },
  { name: "Greenwich", pos: "map-cluster-greenwich", lat: 51.482, lng: 0.006 },
];

function ratingText(pro: PublicProfessional) {
  if (pro.rating == null) return "New";
  return `${pro.rating.toFixed(1)} (${pro.review_count ?? 0})`;
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
  const [zoom, setZoom] = useState(1);
  const [locationNotice, setLocationNotice] = useState("");
  const [locating, setLocating] = useState(false);
  const [selectedArea, setSelectedArea] = useState(
    () =>
      clusters.find(
        (area) =>
          area.name.toLowerCase() ===
          (filters.location || query).trim().toLowerCase(),
      )?.name ?? "",
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mobileView, setMobileView] = useState<"map" | "list">("list");
  const [nearbyResults, setNearbyResults] = useState<
    PublicProfessional[] | null
  >(null);
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [radius, setRadius] = useState(10);
  const requestSequence = useRef(0);
  useEffect(
    () => () => {
      requestSequence.current++;
    },
    [],
  );
  const nearby = nearbyResults ?? professionals;
  const mapped = nearby.filter(
    (pro) =>
      pro.public_location_confirmed_at &&
      coordinatesSchema.safeParse({
        latitude: pro.public_latitude,
        longitude: pro.public_longitude,
      }).success,
  );

  async function findNearby(point: Coordinates, radiusMiles = radius) {
    const sequence = ++requestSequence.current;
    setLocating(true);
    setLocationNotice("Finding professionals with confirmed public pins…");
    try {
      const response = await fetch("/api/v1/explore/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...point, radiusMiles, query, filters }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (sequence !== requestSequence.current) return;
      setNearbyResults(result.professionals);
      setPosition(point);
      setLocationNotice(
        `${result.professionals.length} professionals with confirmed public pins within ${radiusMiles} miles.${result.truncated ? " Showing the closest 100; narrow your radius or filters to see fewer results." : ""} Distances are approximate straight-line distances, not travel distances. Profiles with area details only are excluded from this distance search.`,
      );
    } catch {
      if (sequence !== requestSequence.current) return;
      setNearbyResults(null);
      setPosition(null);
      setLocationNotice(
        "Nearby search is unavailable. Your normal search results remain available; try location search again.",
      );
    } finally {
      if (sequence === requestSequence.current) setLocating(false);
    }
  }
  function clearLocation() {
    requestSequence.current++;
    setNearbyResults(null);
    setPosition(null);
    setLocating(false);
    setLocationNotice("Location cleared. Showing normal search results.");
  }

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
    const updated = { ...filters };
    const keys = {
      verified: "verified",
      under50: "under50",
      topRated: "topRated",
      travels: "travels",
      today: "availableToday",
    } as const;
    if (toggle) updated[keys[toggle]] = !updated[keys[toggle]];
    return discoveryHref(nextQuery, updated);
  };

  const anySecondaryFilter =
    filterPairs.some(([, active]) => active) ||
    !!filters.maxPricePence ||
    !!filters.minRating;

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationNotice(
        "Location is not available in this browser. Search by area instead.",
      );
      return;
    }
    const sequence = ++requestSequence.current;
    setLocating(true);
    setLocationNotice("Checking your location for this search…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (sequence !== requestSequence.current) return;
        const parsed = coordinatesSchema.safeParse({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (
          !parsed.success ||
          !Number.isFinite(coords.accuracy) ||
          coords.accuracy > 200
        ) {
          setLocating(false);
          setLocationNotice(
            "Your device location is too approximate for useful distances. Try again or search by area.",
          );
          return;
        }
        void findNearby(parsed.data);
      },
      () => {
        if (sequence !== requestSequence.current) return;
        setLocating(false);
        setLocationNotice(
          "Location permission was not granted. You can still search by area or street.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div
      className={`map-explore-page${nearbyResults !== null ? " is-nearby" : ""}`}
    >
      <section className="map-explore-hero">
        <div className="map-explore-title-row">
          <div>
            <h1>
              Find Beauty Professionals <em>Near You</em>
            </h1>
            <p>
              Search services and areas together. Compare prices, ratings and
              verified profiles.
            </p>
          </div>
          <form className="map-explore-search" role="search">
            {filters.verified && (
              <input type="hidden" name="verified" value="1" />
            )}
            {filters.under50 && (
              <input type="hidden" name="under50" value="1" />
            )}
            {filters.topRated && (
              <input type="hidden" name="topRated" value="1" />
            )}
            {filters.travels && (
              <input type="hidden" name="travels" value="1" />
            )}
            {filters.availableToday && (
              <input type="hidden" name="today" value="1" />
            )}
            {filters.location && (
              <input type="hidden" name="location" value={filters.location} />
            )}
            {filters.category && (
              <input type="hidden" name="category" value={filters.category} />
            )}
            {filters.maxPricePence && (
              <input
                type="hidden"
                name="price"
                value={filters.maxPricePence / 100}
              />
            )}
            {filters.minRating && (
              <input type="hidden" name="rating" value={filters.minRating} />
            )}
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
              href={discoveryHref(query, {
                ...filters,
                location: area.name === "All London" ? "" : area.name,
              })}
              className={`map-area-card ${area.className} ${
                (area.name === "All London" && !filters.location) ||
                filters.location?.toLowerCase() === area.name.toLowerCase() ||
                filters.location?.toLowerCase() === area.street.toLowerCase()
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
              href={discoveryHref(query, {
                ...filters,
                category: filter === "All Services" ? "" : filter,
              })}
              className={
                (index === 0 && !filters.category) ||
                filters.category?.toLowerCase() === filter.toLowerCase()
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
          <Link
            className={filters.availableToday ? "active" : undefined}
            href={hrefFor(query, "today")}
          >
            Available today
          </Link>
          <Link
            className={filters.verified ? "active" : undefined}
            href={hrefFor(query, "verified")}
          >
            <BadgeCheck size={15} aria-hidden /> Verified only
          </Link>
          <Link
            className={filters.travels ? "active" : undefined}
            href={hrefFor(query, "travels")}
          >
            Travels to you
          </Link>
          <Link
            className={filters.under50 ? "active" : undefined}
            href={hrefFor(query, "under50")}
          >
            Under £50
          </Link>
          <Link
            className={filters.topRated ? "active" : undefined}
            href={hrefFor(query, "topRated")}
          >
            <Star size={15} aria-hidden /> Top rated
          </Link>
          {anySecondaryFilter ? (
            <Link
              href={discoveryHref(query, {
                verified: false,
                under50: false,
                topRated: false,
                travels: false,
                availableToday: false,
                location: filters.location,
                category: filters.category,
              })}
            >
              <SlidersHorizontal size={16} aria-hidden /> Clear filters
            </Link>
          ) : (
            <Link href="/explore?verified=1&topRated=1">
              <SlidersHorizontal size={16} aria-hidden /> Trusted picks
            </Link>
          )}
        </div>
      </section>

      <details className="discovery-refine">
        <summary>Refine area, service, price and rating</summary>
        <form action="/explore" className="discovery-refine-form">
          {query && <input type="hidden" name="q" value={query} />}
          {filterPairs
            .filter(([, active]) => active)
            .map(([key]) => (
              <input key={key} type="hidden" name={key} value="1" />
            ))}
          <label>
            Area or city
            <input
              name="location"
              defaultValue={filters.location || ""}
              placeholder="e.g. Brixton"
              maxLength={100}
            />
          </label>
          <label>
            Service or category
            <input
              name="category"
              defaultValue={filters.category || ""}
              placeholder="e.g. Nails"
              maxLength={60}
            />
          </label>
          <label>
            Maximum price (£)
            <input
              name="price"
              type="number"
              min={1}
              max={10000}
              step={1}
              defaultValue={
                filters.maxPricePence ? filters.maxPricePence / 100 : ""
              }
              placeholder="Any price"
            />
          </label>
          <label>
            Minimum rating
            <select name="rating" defaultValue={filters.minRating || ""}>
              <option value="">Any rating</option>
              <option value="4">4 stars and above</option>
              <option value="4.5">4.5 stars and above</option>
            </select>
          </label>
          <button className="button" type="submit">
            Apply filters
          </button>
          <Link
            href={
              query ? `/explore?q=${encodeURIComponent(query)}` : "/explore"
            }
          >
            Clear all filters
          </Link>
        </form>
      </details>
      <div
        className="map-mobile-view-toggle"
        role="group"
        aria-label="Explore view"
      >
        <button
          type="button"
          aria-pressed={mobileView === "list"}
          className={mobileView === "list" ? "is-active" : undefined}
          onClick={() => setMobileView("list")}
        >
          List
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "map"}
          className={mobileView === "map" ? "is-active" : undefined}
          onClick={() => setMobileView("map")}
        >
          Map
        </button>
      </div>

      <section className="nearby-search-tools" aria-label="Distance search">
        <button
          type="button"
          className="button secondary"
          aria-busy={locating}
          disabled={locating}
          onClick={useMyLocation}
        >
          <LocateFixed size={17} aria-hidden />
          {locating ? "Finding nearby…" : "Use my location"}
        </button>
        <label>
          Distance radius
          <select
            value={radius}
            disabled={locating}
            onChange={(event) => {
              const value = Number(event.target.value);
              setRadius(value);
              if (position) void findNearby(position, value);
            }}
          >
            {[1, 5, 10, 25, 50, 100].map((value) => (
              <option key={value} value={value}>
                Within {value} miles
              </option>
            ))}
          </select>
        </label>
        {(position || locating) && (
          <button
            type="button"
            className="button secondary"
            onClick={clearLocation}
          >
            Clear my location
          </button>
        )}
        <p>
          Location is used only for this search. It isn’t stored or added to the
          page URL.
        </p>
        {locationNotice && <p role="status">{locationNotice}</p>}
      </section>
      <section className={`map-results-layout mobile-view-${mobileView}`}>
        {mapped.length > 0 ? (
          <div className="glohaus-map geographic-results">
            <GeographicMap
              pins={mapped.map((pro) => ({
                id: pro.id,
                label: pro.business_name,
                href: `/p/${pro.slug}`,
                latitude: pro.public_latitude!,
                longitude: pro.public_longitude!,
              }))}
              focus={{
                latitude: mapped[0].public_latitude!,
                longitude: mapped[0].public_longitude!,
              }}
            />
            <p>
              Public business pins confirmed by the professionals.{" "}
              {nearby.length - mapped.length > 0
                ? `${nearby.length - mapped.length} profiles have area details only.`
                : ""}
            </p>
          </div>
        ) : (
          <div
            className="glohaus-map"
            aria-label="Stylised London beauty discovery map"
          >
            <div
              className="map-canvas"
              style={
                {
                  "--map-scale": zoom,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                } as CSSProperties
              }
            >
              <div className="map-road map-road-a" />
              <div className="map-road map-road-b" />
              <div className="map-road map-road-c" />
              <div className="map-river" />
              <span className="map-city-label">London</span>
              <span className="map-borough-label map-label-hackney">
                HACKNEY
              </span>
              <span className="map-borough-label map-label-westminster">
                WESTMINSTER
              </span>
              <span className="map-borough-label map-label-lewisham">
                LEWISHAM
              </span>

              {clusters.map((cluster) => (
                <button
                  type="button"
                  key={cluster.name}
                  className={`map-cluster ${cluster.pos} ${selectedArea === cluster.name ? "is-selected" : ""}`}
                  aria-pressed={selectedArea === cluster.name}
                  onClick={() => setSelectedArea(cluster.name)}
                >
                  <strong>{cluster.name}</strong>
                  <small>
                    {selectedArea === cluster.name ? "Selected" : "Choose area"}
                  </small>
                </button>
              ))}
            </div>
            <div className="map-controls">
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 1.35}
                onClick={() =>
                  setZoom((value) => Math.min(1.35, +(value + 0.1).toFixed(2)))
                }
              >
                +
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 0.85}
                onClick={() =>
                  setZoom((value) => Math.max(0.85, +(value - 0.1).toFixed(2)))
                }
              >
                −
              </button>
            </div>
            <div className="map-pan-controls" aria-label="Move map">
              <button
                type="button"
                aria-label="Move map left"
                onClick={() =>
                  setPan((p) => ({ ...p, x: Math.max(-160, p.x - 60) }))
                }
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Move map right"
                onClick={() =>
                  setPan((p) => ({ ...p, x: Math.min(160, p.x + 60) }))
                }
              >
                →
              </button>
              <button
                type="button"
                aria-label="Move map up"
                onClick={() =>
                  setPan((p) => ({ ...p, y: Math.max(-160, p.y - 60) }))
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move map down"
                onClick={() =>
                  setPan((p) => ({ ...p, y: Math.min(160, p.y + 60) }))
                }
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  setPan({ x: 0, y: 0 });
                  setZoom(1);
                  setSelectedArea("");
                }}
              >
                Reset
              </button>
            </div>
            <div className="map-street-card">
              <div className="map-street-thumb">
                <MapPin size={24} aria-hidden />
              </div>
              <div>
                <strong>{selectedArea || "Explore London"}</strong>
                <span>Illustrated area guide · select an area to search</span>
                <Link
                  href={discoveryHref(query, {
                    ...filters,
                    location: selectedArea,
                  })}
                >
                  {selectedArea ? `Search ${selectedArea}` : "Search all areas"}{" "}
                  →
                </Link>
              </div>
            </div>

            <div className="map-legend">
              <span>
                <i className="bubble" /> Explore area
              </span>
              <span>
                <i className="square" /> Illustrated guide
              </span>
            </div>
          </div>
        )}
        <aside className="map-pro-results">
          <div className="map-pro-heading">
            <div>
              <h2>
                {query
                  ? `Professionals for “${query}”`
                  : filters.location
                    ? `Professionals in ${filters.location}`
                    : "Professionals"}
              </h2>
              <p>
                {nearby.length
                  ? `${nearby.length} matching profiles`
                  : "Discover independent beauty talent"}
              </p>
            </div>
          </div>

          {nearby.length ? (
            <div className="map-pro-list">
              {nearby.map((pro) => (
                <article className="map-pro-row" key={pro.id}>
                  <Link
                    href={`/p/${pro.slug}`}
                    className="map-pro-avatar"
                    aria-label={pro.business_name}
                  >
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
                    <Link
                      className="map-next-availability"
                      href={`/p/${pro.slug}#booking`}
                    >
                      Check next availability →
                    </Link>
                    <span className="map-pro-rating">
                      <Star size={13} fill="currentColor" aria-hidden />{" "}
                      {ratingText(pro)}
                    </span>
                    <div className="map-pro-tags">
                      <span>{pro.category}</span>
                      <span>{pro.city}</span>
                      {pro.distance_miles != null && (
                        <span className="map-pro-distance">
                          {distanceLabel(pro.distance_miles)} · straight line
                        </span>
                      )}
                      {pro.distance_miles == null && (
                        <span>
                          {pro.public_location_confirmed_at
                            ? "Public pin confirmed"
                            : "Area only · distance unavailable"}
                        </span>
                      )}
                      {pro.verification_status === "verified" && (
                        <span>Verified</span>
                      )}
                      {pro.travels_to_you && <span>Travels to you</span>}
                    </div>
                  </div>
                  <Link
                    href={`/p/${pro.slug}`}
                    className="map-heart"
                    aria-label={`View profile of ${pro.business_name}`}
                  >
                    <ArrowUpRight size={18} aria-hidden />
                  </Link>
                  <Link className="map-book-button" href={`/p/${pro.slug}`}>
                    Book
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="map-pro-empty">
              <Sparkles size={28} aria-hidden />
              <h3>No matching professionals yet.</h3>
              <p>
                Try another area, a wider distance radius or a different service
                while the GLOHAUS directory grows.
              </p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
