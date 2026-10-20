"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Heart,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { TaxonomyFilters } from "./taxonomy-filters";
import { ProfessionalVerificationBadges } from "./professional-verification-badges";
import type { MapViewport } from "./geographic-map";
import { GeographicMap } from "./geographic-map";
import { LondonMapOverview } from "./london-map-overview";
import {
  londonBoroughs,
  londonBorough,
} from "@/modules/professionals/london-boroughs";
import { ProfessionalDirections } from "./professional-directions";
import { ExampleProfessionalListings } from "./example-professional-listings";
import type { ExampleListing } from "@/modules/professionals/example-visibility";
import {
  coordinatesSchema,
  distanceLabel,
  type Coordinates,
} from "@/modules/professionals/location";
import { money, type PublicProfessional } from "@/modules/professionals/domain";
import {
  discoveryHref,
  type DiscoveryFilters,
} from "@/modules/professionals/discovery";
import {
  serviceDeepLink,
  type TaxonomyCatalog,
} from "@/modules/taxonomy/domain";
import type { FollowStateMap } from "@/modules/follows/repository";
const QuickView = dynamic(() =>
  import("./discovery-quick-view").then((m) => m.DiscoveryQuickView),
);
const areas = londonBoroughs;
function bookingHref(pro: PublicProfessional) {
  const s = pro.matching_services?.[0];
  return s
    ? serviceDeepLink(pro.slug, s.id, s.speciality_id)
    : `/p/${pro.slug}#services`;
}
function nextSlot(pro: PublicProfessional) {
  return pro.next_available_at
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }).format(new Date(pro.next_available_at))
    : pro.available_today
      ? "Available today"
      : "Check availability";
}
export function ExploreMapExperience({
  professionals,
  query,
  filters,
  taxonomy,
  signedIn = false,
  loadFailed = false,
  examples = [],
}: {
  professionals: PublicProfessional[];
  query: string;
  filters: DiscoveryFilters;
  taxonomy?: TaxonomyCatalog;
  signedIn?: boolean;
  loadFailed?: boolean;
  examples?: ExampleListing[];
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [nearbyResults, setNearbyResults] = useState<
    PublicProfessional[] | null
  >(null);
  const [position, setPosition] = useState<Coordinates | null>(null),
    [radius, setRadius] = useState(10);
  const [locating, setLocating] = useState(false),
    [locationNotice, setLocationNotice] = useState("");
  const [streetView, setStreetView] = useState(false);
  const [mobileView, setMobileView] = useState<"map" | "list">("list");
  const [selected, setSelected] = useState<string | null>(null),
    [highlighted, setHighlighted] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicProfessional | null>(null),
    [viewport, setViewport] = useState<MapViewport | null>(null);
  const [follow, setFollow] = useState<FollowStateMap>({}),
    [saving, setSaving] = useState<string | null>(null),
    [saveNotice, setSaveNotice] = useState("");
  const sequence = useRef(0);
  const refinePanel = useRef<HTMLDetailsElement>(null);
  const locationSearch = (filters.location ?? "").trim();
  const londonSearch =
    !locationSearch ||
    Boolean(londonBorough(locationSearch)) ||
    /\blondon\b/i.test(locationSearch) ||
    /^(?:E|EC|N|NW|SE|SW|W|WC)\d{1,2}[A-Z]?(?:\s*\d[A-Z]{2})?$/i.test(locationSearch);
  const showLondonOverview = londonSearch && !streetView;
  const nearby = nearbyResults ?? professionals;
  const unavailable = loadFailed && nearbyResults === null;
  const showExamples =
    !position && !locating && examples.length > 0;
  const mapped = nearby.filter(
    (p) =>
      p.public_location_confirmed_at &&
      coordinatesSchema.safeParse({
        latitude: p.public_latitude,
        longitude: p.public_longitude,
      }).success,
  );
  const selectedPro = nearby.find((p) => p.id === selected);
  const ids = nearby.map((p) => p.id).join(",");
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (!signedIn || !ids) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    ids.split(",").forEach((id) => params.append("professionalId", id));
    fetch(`/api/v1/follows?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setFollow(data.states);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [ids, signedIn]);
  const selectPin = useCallback((id: string) => {
    setSelected(id);
    if (window.matchMedia("(min-width: 901px)").matches)
      document
        .getElementById(`discovery-${id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  function showOnMap(pro: PublicProfessional) {
    if (!mapped.some((pin) => pin.id === pro.id)) return;
    setSelected(pro.id);
    setStreetView(true);
    setMobileView("map");
    requestAnimationFrame(() =>
      document
        .getElementById("professional-map")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }
  async function save(pro: PublicProfessional) {
    if (!signedIn) {
      router.push(
        `/sign-in?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }
    setSaving(pro.id);
    setSaveNotice("");
    try {
      const r = await fetch("/api/v1/follows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: pro.id,
          following: !follow[pro.id]?.following,
        }),
      });
      if (!r.ok)
        throw Error(
          "Could not save. Sign in with your customer account and try again.",
        );
      const state = await r.json();
      setFollow((v) => ({ ...v, [pro.id]: state }));
      setSaveNotice(
        state.following
          ? `${pro.business_name} saved to your Following list.`
          : `${pro.business_name} removed from your Following list.`,
      );
    } catch (e) {
      setSaveNotice(
        e instanceof Error ? e.message : "Could not save. Try again.",
      );
    } finally {
      setSaving(null);
    }
  }
  async function findNearby(point: Coordinates, radiusMiles = radius) {
    const current = ++sequence.current;
    setLocating(true);
    setLocationNotice("Finding professionals with confirmed public pins…");
    try {
      const r = await fetch("/api/v1/explore/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...point, radiusMiles, query, filters }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Error();
      const result = await r.json();
      if (current !== sequence.current) return;
      setNearbyResults(result.professionals);
      setStreetView(true);
      setPosition(point);
      setSelected(null);
      setLocationNotice(
        `${result.professionals.length} matching ${result.professionals.length === 1 ? "professional" : "professionals"} within ${radiusMiles.toFixed(1).replace(/\.0$/, "")} miles. Distances are approximate straight-line distances.${result.truncated ? " Showing the closest 100; narrow your area or filters." : ""} Area-only profiles are excluded from distance search.`,
      );
    } catch {
      if (current !== sequence.current) return;
      setLocationNotice(
        unavailable
          ? "Nearby search is unavailable. Please try again."
          : "Nearby search is unavailable. Your previous results remain available; please try again.",
      );
    } finally {
      if (current === sequence.current) setLocating(false);
    }
  }
  function clearLocation() {
    sequence.current++;
    setNearbyResults(null);
    setPosition(null);
    setLocating(false);
    setSelected(null);
    setLocationNotice("Location cleared. Showing normal search results.");
  }
  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationNotice(
        "Location is not available in this browser. Search by area instead.",
      );
      return;
    }
    const current = ++sequence.current;
    setLocating(true);
    setLocationNotice("Checking your location for this search…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (current !== sequence.current) return;
        const p = coordinatesSchema.safeParse({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (
          !p.success ||
          !Number.isFinite(coords.accuracy) ||
          coords.accuracy > 200
        ) {
          setLocating(false);
          setLocationNotice(
            "Your device location is too approximate for useful distances. Try again or search by area.",
          );
          return;
        }
        void findNearby(p.data);
      },
      () => {
        if (current !== sequence.current) return;
        setLocating(false);
        setLocationNotice(
          "Location permission was not granted. You can still search by area or street.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }
  const toggles = [
    ["verified", "Verified only"],
    ["today", "Available today"],
    ["travels", "Travels to you"],
    ["under50", "Under £50"],
    ["topRated", "Top rated"],
  ] as const;
  const keys = {
    verified: "verified",
    today: "availableToday",
    travels: "travels",
    under50: "under50",
    topRated: "topRated",
  } as const;
  const hiddenInputs = Object.fromEntries(
    new URLSearchParams(discoveryHref(query, filters).split("?")[1] ?? ""),
  );
  return (
    <div
      className={`map-explore-page discovery-hybrid discovery-original${nearbyResults !== null ? " is-nearby" : ""}`}
    >
      <section className="map-explore-hero">
        <div className="map-explore-title-row">
          <div>
            <h1>
              Find Beauty Professionals <em>Near You</em>
            </h1>
            <p>Find your service. Meet your professional. Make time for you.</p>
          </div>
          <form action="/explore" role="search" className="map-explore-search">
            {Object.entries(hiddenInputs)
              .filter(([key]) => key !== "q" && key !== "location")
              .map(([key, value]) => (
                <input type="hidden" name={key} value={value} key={key} />
              ))}
            <Search size={20} aria-hidden />
            <label className="sr-only" htmlFor="map-search">
              Search service, professional or area
            </label>
            <input
              id="map-search"
              name="q"
              defaultValue={query}
              maxLength={100}
              placeholder="Search services or professionals"
            />
            <label className="sr-only" htmlFor="map-city-search">City, area or postcode</label>
            <input
              id="map-city-search"
              name="location"
              defaultValue={filters.location ?? ""}
              maxLength={100}
              aria-label="City, area or postcode"
              placeholder="City or postcode (e.g. Manchester, M1)"
            />
            <button type="submit">Search</button>
          </form>
        </div>
        {londonSearch && <nav className="map-area-strip" aria-label="Explore London areas">
          {["All London", ...areas].map((area) => (
            <Link
              key={area}
              className={`map-area-card ${area.toLowerCase().replaceAll(" ", "-")}${(area === "All London" ? !filters.location : filters.location === area) ? " active" : ""}`}
              href={discoveryHref(query, {
                ...filters,
                location: area === "All London" ? undefined : area,
              })}
            >
              <span>{area}</span>
              <small>
                {area === "All London"
                  ? "Across the city"
                  : "Explore the borough"}
              </small>
            </Link>
          ))}
        </nav>}
      </section>
      <nav
        className="discovery-categories map-service-filters"
        aria-label="Beauty categories"
      >
        <Link
          className={!filters.categoryId && !filters.category ? "active" : ""}
          href={discoveryHref(query, {
            ...filters,
            category: undefined,
            categoryId: undefined,
            specialityId: undefined,
            templateId: undefined,
          })}
        >
          All services
        </Link>
        {taxonomy?.categories
          .filter((c) => c.active && !c.legacy_only)
          .map((c) => (
            <Link
              key={c.id}
              className={filters.categoryId === c.id ? "active" : ""}
              href={discoveryHref(query, {
                ...filters,
                category: undefined,
                categoryId: c.id,
                specialityId: undefined,
                templateId: undefined,
              })}
            >
              {c.name}
            </Link>
          ))}
      </nav>
      <div className="discovery-filter-bar">
        {toggles.map(([key, label]) => (
          <Link
            key={key}
            className={filters[keys[key]] ? "active" : ""}
            href={discoveryHref(query, {
              ...filters,
              [keys[key]]: !filters[keys[key]],
            })}
          >
            {label}
          </Link>
        ))}
        <a
          href="#discovery-refine"
          aria-controls="discovery-refine"
          onClick={() => {
            if (refinePanel.current) refinePanel.current.open = true;
          }}
        >
          <SlidersHorizontal size={15} />
          More filters
        </a>
      </div>
      <details id="discovery-refine" className="discovery-refine" ref={refinePanel}>
        <summary>Refine area, service, price and rating</summary>
        <form action="/explore" className="discovery-refine-form">
          {query && <input type="hidden" name="q" value={query} />}{" "}
          {toggles
            .filter(([key]) => filters[keys[key]])
            .map(([key]) => (
              <input type="hidden" key={key} name={key} value="1" />
            ))}
          {taxonomy && (
            <TaxonomyFilters
              catalog={taxonomy}
              categoryId={filters.categoryId}
              specialityId={filters.specialityId}
              templateId={filters.templateId}
            />
          )}
          <label>
            City, area or postcode
            <input
              name="location"
              defaultValue={filters.location ?? ""}
              maxLength={100}
              placeholder="e.g. Manchester, Bristol or SW9"
            />
          </label>
          <label>
            Available on
            <input type="date" name="date" defaultValue={filters.date ?? ""} />
          </label>
          <label>
            Maximum service price (£)
            <input
              name="price"
              type="number"
              min="1"
              max="10000"
              step="1"
              defaultValue={
                filters.maxPricePence ? filters.maxPricePence / 100 : ""
              }
            />
          </label>
          <label>
            Minimum rating
            <select name="rating" defaultValue={filters.minRating ?? ""}>
              <option value="">Any rating</option>
              <option value="4">4+ stars</option>
              <option value="4.5">4.5+ stars</option>
            </select>
          </label>
          <button type="submit" className="button">
            Apply filters
          </button>
          <Link href="/explore">Clear all filters</Link>
        </form>
      </details>
      <div className="discovery-location-row">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          aria-busy={locating}
        >
          <LocateFixed size={17} />
          {locating ? "Finding nearby…" : "Use my location"}
        </button>
        <label>
          Distance radius
          <select
            value={radius}
            disabled={locating}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRadius(r);
              if (position) void findNearby(position, r);
            }}
          >
            {[1, 5, 10, 25, 50, 100].map((r) => (
              <option key={r} value={r}>
                Within {r} miles
              </option>
            ))}
          </select>
        </label>
        {(position || locating) && (
          <button type="button" onClick={clearLocation}>
            Clear my location
          </button>
        )}
        {londonSearch && <label>
          London borough
          <select
            value={londonBorough(filters.location) ?? ""}
            onChange={(event) =>
              router.push(
                discoveryHref(query, {
                  ...filters,
                  location: event.target.value || undefined,
                }),
              )
            }
          >
            <option value="">Choose a London borough</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>}
        <small>Location is used only for this search and isn’t stored.</small>
      </div>
      {locationNotice && (
        <p className="discovery-status" role="status">
          {locationNotice}
        </p>
      )}
      {saveNotice && (
        <p className="discovery-status" role="status">
          {saveNotice}
        </p>
      )}
      <div
        className="map-mobile-view-toggle"
        role="group"
        aria-label="Explore view"
      >
        {(["list", "map"] as const).map((view) => (
          <button
            type="button"
            key={view}
            aria-pressed={mobileView === view}
            onClick={() => setMobileView(view)}
          >
            {view === "list" ? "List" : "Map"}
          </button>
        ))}
      </div>
      {unavailable && (
        <div className="map-pro-empty discovery-load-error" role="alert" aria-busy={retrying}>
          <Search size={28} aria-hidden />
          <h3>We couldn’t load professionals right now.</h3>
          <p>Your search filters are saved. Try loading the results again.</p>
          <button type="button" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
            {retrying ? "Loading results…" : "Retry loading results"}
          </button>
        </div>
      )}
      <section className={`map-results-layout mobile-view-${mobileView}`}>
        <aside className="map-pro-results">
          <header className="discovery-result-heading">
            <h2>
              {showExamples
                ? "Explore beauty profiles"
                : query
                  ? `Professionals for “${query}”`
                  : filters.location
                    ? `Professionals in ${filters.location}`
                    : "Discover your next beauty expert"}
            </h2>
            {!unavailable && (!showExamples || nearby.length > 0) && (
              <p>
                {nearby.length} matching{" "}
                {nearby.length === 1 ? "professional" : "professionals"} ·{" "}
                {position ? "Closest first" : "Recommended"}
              </p>
            )}
            {(!showExamples || nearby.length > 0) && (
              <small>
                Prices match your search. Availability is indicative and checked
                again when booking.
              </small>
            )}
          </header>
          <div className="map-pro-list">
            {nearby.map((pro) => (
              <article
                id={`discovery-${pro.id}`}
                key={pro.id}
                className={`discovery-card${selected === pro.id || highlighted === pro.id ? " is-selected" : ""}`}
                onMouseEnter={() => setHighlighted(pro.id)}
                onMouseLeave={() => setHighlighted(null)}
                onFocus={() => setHighlighted(pro.id)}
                onBlur={() => setHighlighted(null)}
              >
                <div className="discovery-card-photo">
                  <Link
                    href={`/p/${pro.slug}`}
                    aria-label={`View ${pro.business_name}`}
                  >
                    {(pro.portfolio_photo_id ?? pro.photo_id) ? (
                      <Image
                        src={`/api/media/${pro.portfolio_photo_id ?? pro.photo_id}`}
                        alt={pro.photo_alt || pro.business_name}
                        fill
                        sizes="(max-width:600px) 100vw, 190px"
                        unoptimized
                      />
                    ) : (
                      <span className="discovery-monogram">
                        {pro.business_name.slice(0, 1)}
                      </span>
                    )}
                  </Link>
                  <button
                    type="button"
                    className="discovery-save"
                    aria-label={`${follow[pro.id]?.following ? "Unsave" : "Save"} ${pro.business_name}`}
                    aria-pressed={follow[pro.id]?.following ?? false}
                    disabled={saving !== null}
                    onClick={() => void save(pro)}
                  >
                    <Heart
                      size={19}
                      fill={follow[pro.id]?.following ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <div className="discovery-card-copy">
                  {pro.boosted && (
                    <small className="discovery-promoted">Promoted</small>
                  )}
                  <Link className="map-pro-name" href={`/p/${pro.slug}`}>
                    {pro.business_name}
                  </Link>
                  <div className="discovery-rating">
                    <Star size={14} aria-hidden />
                    {pro.rating == null
                      ? "New professional"
                      : `${pro.rating.toFixed(1)} · ${pro.review_count ?? 0} verified booking reviews`}
                  </div>
                  <div className="discovery-badges">
                    <ProfessionalVerificationBadges professional={pro} />
                  </div>
                  <p className="discovery-area">
                    <MapPin size={14} />
                    {pro.city}
                    {pro.distance_miles != null
                      ? ` · ${distanceLabel(pro.distance_miles)}`
                      : !pro.public_location_confirmed_at
                        ? " · Area only"
                        : ""}
                  </p>
                  <p className="discovery-delivery">
                    {pro.travels_to_you
                      ? "Travels to you"
                      : "Visit professional"}
                  </p>
                  <div className="matching-services">
                    {pro.matching_services?.slice(0, 2).map((s) => (
                      <Link
                        key={s.id}
                        href={serviceDeepLink(pro.slug, s.id, s.speciality_id)}
                      >
                        {s.name}
                        {s.speciality_name
                          ? ` · ${s.speciality_name}`
                          : ""} · {money(s.price_pence)}
                      </Link>
                    ))}
                  </div>
                  <p className="discovery-next">
                    Next: {nextSlot(pro)}
                    {pro.next_available_at ? " (London time)" : ""}
                  </p>
                  <div className="discovery-card-actions">
                    <strong>
                      {pro.from_price_pence != null ? (
                        <>From {money(pro.from_price_pence)}</>
                      ) : (
                        "View prices"
                      )}
                    </strong>
                    <button type="button" onClick={() => setPreview(pro)}>
                      Quick View
                    </button>
                    <Link className="discovery-book" href={bookingHref(pro)}>
                      Book Now
                    </Link>
                  </div>
                  {mapped.some((pin) => pin.id === pro.id) ? (
                    <button
                      className="discovery-show-pin"
                      type="button"
                      onClick={() => showOnMap(pro)}
                    >
                      <MapPin size={14} aria-hidden /> Show {pro.business_name}{" "}
                      on map
                    </button>
                  ) : (
                    <small className="discovery-area-only">
                      Area only · no public pin shared
                    </small>
                  )}
                  <ProfessionalDirections professional={pro} />
                </div>
              </article>
            ))}
          </div>
          {!unavailable && !nearby.length && !showExamples && (
            <div className="map-pro-empty">
              <Search size={28} />
              <h3>No matching professionals yet.</h3>
              <p>Try another area, a wider radius or a different service.</p>
              <Link href="/explore">Clear filters</Link>
            </div>
          )}
          {showExamples && <ExampleProfessionalListings examples={examples} />}
        </aside>
        <div id="professional-map" className="discovery-map-panel">
          <div className="discovery-map-toolbar">
            <span>
              <MapPin size={16} />
              Professional-confirmed public locations
            </span>
            <button
              type="button"
              disabled={!viewport || locating}
              onClick={() =>
                viewport && void findNearby(viewport, viewport.radiusMiles)
              }
            >
              Search this area
            </button>
          </div>
          <button
            className="discovery-map-switch"
            type="button"
            onClick={() => {
              setStreetView((value) => !value);
              setSelected(null);
            }}
          >
            {streetView
              ? (londonSearch ? "Back to London overview" : "View area results")
              : (londonSearch ? "View confirmed business pins" : "View map pins")}
          </button>
          {streetView ? (
            <GeographicMap
              pins={mapped.map((pro) => ({
                id: pro.id,
                label: pro.business_name,
                priceLabel:
                  pro.from_price_pence != null
                    ? money(pro.from_price_pence)
                    : undefined,
                latitude: pro.public_latitude!,
                longitude: pro.public_longitude!,
              }))}
              focus={
                selectedPro?.public_location_confirmed_at
                  ? {
                      latitude: selectedPro.public_latitude!,
                      longitude: selectedPro.public_longitude!,
                    }
                  : (position ??
                    (mapped[0]
                      ? {
                          latitude: mapped[0].public_latitude!,
                          longitude: mapped[0].public_longitude!,
                        }
                      : undefined))
              }
              initialZoom={selectedPro ? 16 : 12}
              focusZoom={selectedPro ? 16 : undefined}
              selectedId={selected}
              highlightedId={highlighted}
              onSelect={selectPin}
              onHighlight={setHighlighted}
              onViewportChange={setViewport}
            />
          ) : showLondonOverview ? (
            <LondonMapOverview query={query} filters={filters} />
          ) : mapped.length ? (
            <GeographicMap
              pins={mapped.map((pro) => ({
                id: pro.id,
                label: pro.business_name,
                priceLabel: pro.from_price_pence != null ? money(pro.from_price_pence) : undefined,
                latitude: pro.public_latitude!,
                longitude: pro.public_longitude!,
              }))}
              focus={{ latitude: mapped[0].public_latitude!, longitude: mapped[0].public_longitude! }}
              initialZoom={11}
              selectedId={selected}
              highlightedId={highlighted}
              onSelect={selectPin}
              onHighlight={setHighlighted}
              onViewportChange={setViewport}
            />
          ) : (
            <div className="map-pro-empty" role="status">
              <MapPin size={28} />
              <h3>No confirmed map pins for {locationSearch}</h3>
              <p>Professionals may still appear in the results list. Try another city or postcode, or widen your search.</p>
            </div>
          )}
          {streetView && selectedPro && (
            <div className="discovery-pin-card">
              <button
                type="button"
                className="discovery-pin-close"
                aria-label="Close map selection"
                onClick={() => setSelected(null)}
              >
                <X size={17} />
              </button>
              <strong>{selectedPro.business_name}</strong>
              <span>
                {selectedPro.matching_services?.[0]?.name ??
                  selectedPro.category}
                {selectedPro.from_price_pence != null
                  ? ` · From ${money(selectedPro.from_price_pence)}`
                  : ""}
              </span>
              <small>Next: {nextSlot(selectedPro)}</small>
              <ProfessionalDirections professional={selectedPro} />
              <div>
                <button type="button" onClick={() => setPreview(selectedPro)}>
                  Quick View
                </button>
                <Link href={bookingHref(selectedPro)}>Book Now →</Link>
              </div>
            </div>
          )}
          <p className="discovery-pin-note">
            {unavailable
              ? "Business locations couldn’t be loaded. Retry the results to check available professionals."
              : mapped.length
              ? `${mapped.length} confirmed public pins. ${nearby.length - mapped.length ? `${nearby.length - mapped.length} profiles show an area only.` : ""}`
              : "No confirmed public pins for this search. Browse the results or search another area."}{" "}
            Private addresses are never inferred.
          </p>
        </div>
      </section>
      {preview && (
        <QuickView
          key={preview.id}
          professional={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
