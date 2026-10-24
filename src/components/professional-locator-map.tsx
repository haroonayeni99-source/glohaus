"use client";
import { readPublicEnvironment } from "@/lib/public-runtime-config";

import { useEffect, useRef, useState } from "react";
import { loadMapLibre, supportsMapGraphics } from "@/lib/maplibre-client";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import Link from "next/link";
import {
  distanceMiles,
  type Coordinates,
} from "@/modules/professionals/location";

type Pin = Coordinates & { id: string; label: string; priceLabel?: string };
export type MapViewport = Coordinates & { radiusMiles: number };

export function ProfessionalLocatorMap({
  pins,
  focus,
  selectedId,
  highlightedId,
  onSelect,
  onHighlight,
  onViewportChange,
  resetLondonSignal,
}: {
  pins: Pin[];
  focus?: Coordinates;
  selectedId?: string | null;
  highlightedId?: string | null;
  onSelect: (id: string) => void;
  onHighlight?: (id: string | null) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  resetLondonSignal?: number;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, MapLibreMarker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const onHighlightRef = useRef(onHighlight);
  const viewportRef = useRef(onViewportChange);
  const currentFocus = useRef<Coordinates | undefined>(undefined);
  const previousLondonReset = useRef(resetLondonSignal ?? 0);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () =>
      setDarkMode(
        root.dataset.theme === "night" || root.classList.contains("dark"),
      );
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onHighlightRef.current = onHighlight;
    viewportRef.current = onViewportChange;
  }, [onSelect, onHighlight, onViewportChange]);

  useEffect(() => {
    if (!consented || !mapContainer.current) return;
    let cancelled = false;
    const activeMarkers = markers.current;
    const cartoKey = readPublicEnvironment("NEXT_PUBLIC_CARTO_BASEMAPS_KEY");
    let instance: MapLibreMap | null = null;
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    const failed = () => {
      if (!cancelled) {
        map.current = null;
        setReady(false);
        setError(true);
      }
    };
    if (!supportsMapGraphics()) {
      queueMicrotask(failed);
      return () => {
        cancelled = true;
      };
    }
    loadMapLibre()
      .then(({ Map, NavigationControl, FullscreenControl }) => {
        if (cancelled || !mapContainer.current) return;
        instance = new Map({
          container: mapContainer.current,
          // CARTO vector styles keep street and district names as separate, sharp text layers.
          // On previews without a key, fall back to the existing public OSM raster style.
          style: cartoKey
            ? `https://basemaps.cartocdn.com/gl/${darkMode ? "dark-matter-gl-style" : "positron-gl-style"}/style.json?key=${encodeURIComponent(cartoKey)}`
            : {
                version: 8,
                sources: {
                  streets: {
                    type: "raster",
                    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    tileSize: 256,
                    attribution: "© OpenStreetMap contributors",
                  },
                },
                layers: [{ id: "streets", type: "raster", source: "streets" }],
              },
          center: focus
            ? [focus.longitude, focus.latitude]
            : [-0.1278, 51.5074],
          zoom: 10,
          minZoom: 2,
          maxZoom: 19,
          attributionControl: {},
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.current = instance;
        readinessTimer = setTimeout(failed, 15000);
        instance.on("load", () => {
          clearTimeout(readinessTimer);
          if (!cancelled && map.current === instance) {
            setReady(true);
            setError(false);
          }
        });
        instance.getCanvas().addEventListener("webglcontextlost", failed);
        instance.on("style.load", () => {
          if (!instance || !cartoKey) return;
          // GLOHAUS label palette: dark charcoal on light, warm-white on dark.
          // Symbol text is vector-rendered, so road and borough labels remain crisp.
          const labels = instance
            .getStyle()
            .layers.filter(
              (layer) =>
                layer.type === "symbol" &&
                layer.layout?.["text-field"] !== undefined,
            );
          for (const layer of labels) {
            try {
              instance.setPaintProperty(
                layer.id,
                "text-color",
                darkMode ? "#f0e8ee" : "#493f4b",
              );
              instance.setPaintProperty(
                layer.id,
                "text-halo-color",
                darkMode ? "#24252f" : "#fffdfd",
              );
              instance.setPaintProperty(layer.id, "text-halo-width", 1.25);
              // Keep road names readable even where they cross a heavier road line.
              if (/road|street|highway|motorway/i.test(layer.id)) {
                instance.setPaintProperty(layer.id, "text-halo-width", 1.6);
              }
            } catch {
              /* Some provider layers may not support an override. */
            }
          }

          // Increase the prominence of actual road geometry, not parks, water,
          // rail lines or professional location pins. Retain CARTO's zoom hierarchy.
          const roadLayers = instance
            .getStyle()
            .layers.filter(
              (layer) =>
                layer.type === "line" &&
                /road|street|highway|motorway/i.test(layer.id) &&
                !/rail|tram|ferry|water|path|cycle/i.test(layer.id),
            );
          for (const layer of roadLayers) {
            const id = layer.id.toLowerCase();
            const major = /major|motorway|trunk|primary|secondary/.test(id);
            const casing = /casing|outline|border/.test(id);
            const width = instance.getPaintProperty(layer.id, "line-width");
            const multiplier = major ? 1.42 : 1.32;
            try {
              if (typeof width === "number") {
                instance.setPaintProperty(
                  layer.id,
                  "line-width",
                  width * multiplier,
                );
              } else if (Array.isArray(width)) {
                instance.setPaintProperty(layer.id, "line-width", [
                  "*",
                  width,
                  multiplier,
                ]);
              }
            } catch {
              /* Preserve the CARTO line width for incompatible expressions. */
            }
            // Casings keep their original colours, so roads retain their edges.
            if (!casing) {
              try {
                instance.setPaintProperty(
                  layer.id,
                  "line-color",
                  darkMode
                    ? major
                      ? "#8390a3"
                      : "#657186"
                    : major
                      ? "#aca6b3"
                      : "#cac4cf",
                );
              } catch {
                /* Preserve the CARTO road colour if an override is unsupported. */
              }
            }
          }
        });
        instance.addControl(
          new NavigationControl({ showCompass: true }),
          "bottom-right",
        );
        instance.addControl(new FullscreenControl(), "bottom-right");
        instance.on("moveend", () => {
          if (!instance) return;
          const center = instance.getCenter();
          const bounds = instance.getBounds();
          const point = { latitude: center.lat, longitude: center.lng };
          viewportRef.current?.({
            ...point,
            radiusMiles: Math.max(
              0.5,
              Math.min(
                100,
                distanceMiles(point, {
                  latitude: bounds.getNorth(),
                  longitude: bounds.getEast(),
                }),
              ),
            ),
          });
        });
        instance.on("error", (event) => {
          if (event.error) setError(true);
        });
      })
      .catch(failed);
    return () => {
      cancelled = true;
      clearTimeout(readinessTimer);
      for (const marker of activeMarkers.values()) {
        try {
          marker.remove();
        } catch {
          /* An interrupted renderer may already be disposed. */
        }
      }
      activeMarkers.clear();
      try {
        instance?.getCanvas().removeEventListener("webglcontextlost", failed);
        instance?.remove();
      } catch {
        /* Failed graphics initialisation must not crash discovery cleanup. */
      }
      map.current = null;
      setReady(false);
    };
    // Initial map construction only; updates handled by separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented, darkMode]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !focus) return;
    const forcedReset =
      (resetLondonSignal ?? 0) !== previousLondonReset.current;
    previousLondonReset.current = resetLondonSignal ?? 0;
    if (
      currentFocus.current?.latitude === focus.latitude &&
      currentFocus.current?.longitude === focus.longitude &&
      !forcedReset
    )
      return;
    currentFocus.current = focus;
    try {
      instance.flyTo({
        center: [focus.longitude, focus.latitude],
        zoom: forcedReset ? 10 : selectedId ? 14 : 10,
        duration: 800,
        essential: true,
      });
    } catch {
      map.current = null;
      queueMicrotask(() => {
        setReady(false);
        setError(true);
      });
    }
  }, [focus, selectedId, ready, resetLondonSignal]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    let removed = false;
    loadMapLibre()
      .then(({ Marker }) => {
        if (removed || map.current !== instance) return;
        const ids = new Set(pins.map((pin) => pin.id));
        for (const [id, marker] of markers.current) {
          if (!ids.has(id)) {
            marker.remove();
            markers.current.delete(id);
          }
        }
        for (const pin of pins) {
          let marker = markers.current.get(pin.id);
          if (!marker) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "glohaus-locator-pin";
            button.addEventListener("click", () => onSelectRef.current(pin.id));
            button.addEventListener("mouseenter", () =>
              onHighlightRef.current?.(pin.id),
            );
            button.addEventListener("mouseleave", () =>
              onHighlightRef.current?.(null),
            );
            marker = new Marker({ element: button, anchor: "bottom" })
              .setLngLat([pin.longitude, pin.latitude])
              .addTo(instance);
            markers.current.set(pin.id, marker);
          }
          // Keep the DOM node through hover/selection updates so a rerender cannot
          // remove the pointer target between pointerdown and click.
          const button = marker.getElement();
          button.title =
            pin.label + (pin.priceLabel ? " · From " + pin.priceLabel : "");
          button.setAttribute("aria-label", "Select " + pin.label);
          button.setAttribute("aria-pressed", String(selectedId === pin.id));
          button.classList.toggle(
            "is-selected",
            selectedId === pin.id || highlightedId === pin.id,
          );
          marker.setLngLat([pin.longitude, pin.latitude]);
        }
      })
      .catch(() => {
        if (!removed) {
          map.current = null;
          setReady(false);
          setError(true);
        }
      });
    return () => {
      removed = true;
    };
  }, [pins, selectedId, highlightedId, consented, ready]);

  const selected = pins.find((pin) => pin.id === selectedId);
  return (
    <section
      className="glohaus-locator"
      aria-label="Interactive professional locator map"
    >
      {!consented ? (
        <div className="geo-map-gate">
          <h3>Explore beauty professionals on the map</h3>
          <p>
            Load the street map to explore London and beyond. OpenStreetMap
            receives your viewed area and IP address.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setConsented(true)}
          >
            Load street map
          </button>
          <Link
            href="https://osmfoundation.org/wiki/Privacy_Policy"
            target="_blank"
          >
            Map privacy
          </Link>
        </div>
      ) : (
        <>
          <div ref={mapContainer} className="glohaus-locator-canvas" />
          {error && (
            <div className="glohaus-locator-error" role="alert">
              The interactive map could not load in this browser. You can still
              search and browse professional listings.
            </div>
          )}
          {selected && (
            <div className="glohaus-locator-selected" aria-live="polite">
              <strong>{selected.label}</strong>
              <span>
                {selected.priceLabel
                  ? "From " + selected.priceLabel
                  : "View services and pricing"}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
