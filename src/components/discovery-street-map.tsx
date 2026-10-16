"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as StreetMap, Marker } from "maplibre-gl";
import { GeographicMap, type MapViewport } from "./geographic-map";
import {
  distanceMiles,
  type Coordinates,
} from "@/modules/professionals/location";

type Pin = Coordinates & { id: string; label: string; priceLabel?: string };
type Props = {
  pins: Pin[];
  focus?: Coordinates;
  selectedId?: string | null;
  highlightedId?: string | null;
  onSelect: (id: string) => void;
  onHighlight: (id: string | null) => void;
  onViewportChange: (view: MapViewport) => void;
};
const london: Coordinates = { latitude: 51.5074, longitude: -0.1278 };

// Explore-only renderer. The existing public-pin editor keeps its precise 2D map.
export function DiscoveryStreetMap(props: Props) {
  const [loaded, setLoaded] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(false);
  const [tilted, setTilted] = useState(true);
  const [tileError, setTileError] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<StreetMap | null>(null);
  const library = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(
    new Map<string, { marker: Marker; button: HTMLButtonElement }>(),
  );
  const latest = useRef(props);
  const initial = useRef(props.focus ?? props.pins[0] ?? london);
  const focusLatitude = props.focus?.latitude,
    focusLongitude = props.focus?.longitude;
  useEffect(() => {
    latest.current = props;
  }, [props]);

  useEffect(() => {
    if (!loaded || fallback || !host.current) return;
    let active = true;
    let instance: StreetMap | null = null;
    let observer: ResizeObserver | undefined;
    let readinessTimer: number | undefined;
    const pool = markers.current;
    const failed = () => {
      if (active) setFallback(true);
    };
    void import("maplibre-gl")
      .then((gl) => {
        if (!active || !host.current) return;
        library.current = gl;
        try {
          const point = initial.current;
          instance = new gl.Map({
            container: host.current,
            center: [point.longitude, point.latitude],
            zoom: 12,
            pitch: 45,
            bearing: -15,
            maxPitch: 55,
            minZoom: 4,
            maxZoom: 19,
            renderWorldCopies: false,
            cooperativeGestures: true,
            attributionControl: false,
            // Visible tiles only; keep the same OSM source and normal HTTP caching.
            style: {
              version: 8,
              sources: {
                streets: {
                  type: "raster",
                  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                  tileSize: 256,
                  maxzoom: 19,
                },
              },
              layers: [
                {
                  id: "streets",
                  type: "raster",
                  source: "streets",
                  paint: {
                    "raster-saturation": -0.35,
                    "raster-fade-duration": 150,
                  },
                },
              ],
            },
          });
          map.current = instance;
          readinessTimer = window.setTimeout(failed, 12000);
          const report = () => {
            if (!active || !instance) return;
            const center = instance.getCenter(),
              bounds = instance.getBounds();
            const point = { latitude: center.lat, longitude: center.lng };
            latest.current.onViewportChange({
              ...point,
              radiusMiles: Math.max(
                0.5,
                Math.min(
                  100,
                  Math.max(
                    ...[bounds.getNorthEast(), bounds.getSouthWest()].map((p) =>
                      distanceMiles(point, {
                        latitude: p.lat,
                        longitude: p.lng,
                      }),
                    ),
                  ),
                ),
              ),
            });
            setTilted(instance.getPitch() > 5);
          };
          instance.on("style.load", () => {
            window.clearTimeout(readinessTimer);
            if (active) {
              setReady(true);
              report();
            }
          });
          instance.on("moveend", report);
        instance.on("load", () => { if (active) setPainted(true); });
          instance.on("error", () => {
            if (active) setTileError(true);
          });
          instance.getCanvas().addEventListener("webglcontextlost", failed);
          observer = new ResizeObserver(() => instance?.resize());
          observer.observe(host.current);
        } catch {
          failed();
        }
      })
      .catch(failed);
    return () => {
      active = false;
      observer?.disconnect();
      window.clearTimeout(readinessTimer);
      pool.forEach(({ marker }) => marker.remove());
      pool.clear();
      instance?.getCanvas().removeEventListener("webglcontextlost", failed);
      instance?.remove();
      map.current = null;
    };
  }, [loaded, fallback]);

  useEffect(() => {
    if (!ready || !map.current || !library.current) return;
    const pool = markers.current;
    const ids = new Set(props.pins.map((p) => p.id));
    for (const [id, entry] of pool)
      if (!ids.has(id)) {
        entry.marker.remove();
        pool.delete(id);
      }
    for (const pin of props.pins) {
      let entry = pool.get(pin.id);
      if (!entry) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "discovery-gl-pin";
        button.addEventListener("click", () => latest.current.onSelect(pin.id));
        button.addEventListener("mouseenter", () =>
          latest.current.onHighlight(pin.id),
        );
        button.addEventListener("mouseleave", () =>
          latest.current.onHighlight(null),
        );
        button.addEventListener("focus", () =>
          latest.current.onHighlight(pin.id),
        );
        button.addEventListener("blur", () => latest.current.onHighlight(null));
        const marker = new library.current.Marker({
          element: button,
          anchor: "bottom",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map.current);
        entry = { marker, button };
        pool.set(pin.id, entry);
      }
      entry.marker.setLngLat([pin.longitude, pin.latitude]);
      entry.button.textContent = pin.priceLabel ?? pin.label;
      entry.button.setAttribute(
        "aria-label",
        `${pin.label}${pin.priceLabel ? `, from ${pin.priceLabel}` : ""}`,
      );
      entry.button.setAttribute(
        "aria-pressed",
        String(props.selectedId === pin.id),
      );
      entry.button.classList.toggle(
        "is-selected",
        props.selectedId === pin.id || props.highlightedId === pin.id,
      );
    }
  }, [ready, props.pins, props.selectedId, props.highlightedId]);

  useEffect(() => {
    if (!ready || focusLatitude == null || focusLongitude == null) return;
    map.current?.easeTo({
      center: [focusLongitude, focusLatitude],
      duration: 0,
    });
  }, [ready, focusLatitude, focusLongitude]);

  function fitPins() {
    const points = latest.current.pins;
    if (!map.current || !library.current) return;
    if (points.length > 1) {
      const bounds = new library.current.LngLatBounds();
      points.forEach((p) => bounds.extend([p.longitude, p.latitude]));
      map.current.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 0 });
    } else {
      const point = points[0] ?? initial.current;
      map.current.jumpTo({
        center: [point.longitude, point.latitude],
        zoom: 12,
        bearing: 0,
      });
    }
  }
  if (fallback)
    return (
      <>
        <p className="discovery-map-help">
          3D is unavailable on this device. The standard street map is available
          below.
        </p>
        <GeographicMap {...props} />
      </>
    );
  if (!loaded)
    return (
      <section className="geo-map-gate" aria-label="Street map">
        <span className="map-gate-orbit" aria-hidden>
          ↗
        </span>
        <h3>Explore beauty around you</h3>
        <p>
          Move through real streets, compare prices and find your next
          professional. Load the map to enable the tilted view.
        </p>
        <button
          type="button"
          className="button"
          onClick={() => setLoaded(true)}
        >
          Load street map
        </button>
        <small>
          OpenStreetMap receives the area you view and your IP address.
        </small>
        <a
          href="https://osmfoundation.org/wiki/Privacy_Policy"
          target="_blank"
          rel="noreferrer"
        >
          Map privacy
        </a>
      </section>
    );
  return (
    <section
      className="discovery-gl-map"
      aria-busy={!painted}
      aria-label="Map of confirmed professional locations"
    >
      <div className="discovery-gl-canvas" ref={host} />
      {!painted && !tileError && (
        <p className="discovery-map-loading" role="status">
          Loading street map…
        </p>
      )}
      <div className="discovery-gl-top-tools" aria-label="Map perspective">
        <button
          type="button"
          disabled={!ready}
          aria-pressed={!tilted}
          onClick={() =>
            map.current?.easeTo({ pitch: 0, bearing: 0, duration: 0 })
          }
        >
          2D
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={tilted}
          onClick={() =>
            map.current?.easeTo({ pitch: 45, bearing: -15, duration: 0 })
          }
        >
          3D
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label="Reset map north"
          onClick={() => map.current?.resetNorth({ duration: 0 })}
        >
          N ↑
        </button>
      </div>
      <div className="discovery-gl-navigation" aria-label="Map navigation">
        <button
          type="button"
          disabled={!ready}
          aria-label="Zoom in street map"
          onClick={() => map.current?.zoomIn({ duration: 0 })}
        >
          +
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label="Zoom out street map"
          onClick={() => map.current?.zoomOut({ duration: 0 })}
        >
          −
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label="Rotate map left"
          onClick={() =>
            map.current?.rotateTo((map.current?.getBearing() ?? 0) - 30, {
              duration: 0,
            })
          }
        >
          ↶
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label="Rotate map right"
          onClick={() =>
            map.current?.rotateTo((map.current?.getBearing() ?? 0) + 30, {
              duration: 0,
            })
          }
        >
          ↷
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label="Move street map left"
          onClick={() => map.current?.panBy([-180, 0], { duration: 0 })}
        >
          ←
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label="Move street map right"
          onClick={() => map.current?.panBy([180, 0], { duration: 0 })}
        >
          →
        </button>
        <button type="button" disabled={!ready} onClick={fitPins}>
          Show all pins
        </button>
      </div>
      <div className="discovery-gl-footer">
        <span>Drag to explore · Use two fingers on mobile</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </div>
      {tileError && (
        <p className="discovery-map-help" role="status">
          Some streets could not load. Pins and Google Maps directions remain
          available.
        </p>
      )}
    </section>
  );
}
