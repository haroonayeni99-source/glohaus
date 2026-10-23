"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import Link from "next/link";
import { distanceMiles, type Coordinates } from "@/modules/professionals/location";

type Pin = Coordinates & { id: string; label: string; priceLabel?: string };
export type MapViewport = Coordinates & { radiusMiles: number };

export function ProfessionalLocatorMap({
  pins, focus, selectedId, highlightedId, onSelect, onHighlight, onViewportChange, resetLondonSignal,
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
    const syncTheme = () => setDarkMode(root.dataset.theme === "night" || root.classList.contains("dark"));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);
  onSelectRef.current = onSelect;
  onHighlightRef.current = onHighlight;
  viewportRef.current = onViewportChange;

  useEffect(() => {
    if (!consented || !mapContainer.current) return;
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    import("maplibre-gl").then(({ Map, NavigationControl, FullscreenControl }) => {
      if (cancelled || !mapContainer.current) return;
      instance = new Map({
        container: mapContainer.current,
        // CARTO vector styles keep street and district names as separate, sharp text layers.
        // On previews without a key, fall back to the existing public OSM raster style.
        style: process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY
          ? `https://basemaps.cartocdn.com/gl/${darkMode ? "dark-matter-gl-style" : "positron-gl-style"}/style.json?key=${encodeURIComponent(process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY)}`
          : {
              version: 8,
              sources: { streets: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              } },
              layers: [{ id: "streets", type: "raster", source: "streets" }],
            },
        center: focus ? [focus.longitude, focus.latitude] : [-0.1278, 51.5074],
        zoom: 10,
        minZoom: 2,
        maxZoom: 19,
        attributionControl: {},
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.current = instance;
      setReady(true);
      instance.on("style.load", () => {
        if (!instance || !process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY) return;
        // GLOHAUS label palette: dark charcoal on light, warm-white on dark.
        // Symbol text is vector-rendered, so road and borough labels remain crisp.
        const labels = instance.getStyle().layers.filter((layer) =>
          layer.type === "symbol" && layer.layout?.["text-field"] !== undefined,
        );
        for (const layer of labels) {
          try {
            instance.setPaintProperty(layer.id, "text-color", darkMode ? "#f0e8ee" : "#493f4b");
            instance.setPaintProperty(layer.id, "text-halo-color", darkMode ? "#24252f" : "#fffdfd");
            instance.setPaintProperty(layer.id, "text-halo-width", 1.25);
          } catch { /* Some provider layers may not support an override. */ }
        }
      });
      instance.addControl(new NavigationControl({ showCompass: true }), "bottom-right");
      instance.addControl(new FullscreenControl(), "bottom-right");
      instance.on("moveend", () => {
        if (!instance) return;
        const center = instance.getCenter();
        const bounds = instance.getBounds();
        const point = { latitude: center.lat, longitude: center.lng };
        viewportRef.current?.({
          ...point,
          radiusMiles: Math.max(0.5, Math.min(100, distanceMiles(point, {
            latitude: bounds.getNorth(), longitude: bounds.getEast(),
          }))),
        });
      });
      instance.on("error", (event) => {
        if (event.error) setError(true);
      });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      for (const marker of markers.current.values()) marker.remove();
      markers.current.clear();
      instance?.remove();
      map.current = null;
      setReady(false);
    };
  // Initial map construction only; updates handled by separate effects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented, darkMode]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !focus) return;
    const forcedReset = (resetLondonSignal ?? 0) !== previousLondonReset.current;
    previousLondonReset.current = resetLondonSignal ?? 0;
    if (currentFocus.current?.latitude === focus.latitude &&
        currentFocus.current?.longitude === focus.longitude && !forcedReset) return;
    currentFocus.current = focus;
    instance.flyTo({
      center: [focus.longitude, focus.latitude],
      zoom: forcedReset ? 10 : selectedId ? 14 : 10,
      duration: 800,
      essential: true,
    });
  }, [focus, selectedId, ready, resetLondonSignal]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    let removed = false;
    import("maplibre-gl").then(({ Marker }) => {
      if (removed || !map.current) return;
      for (const marker of markers.current.values()) marker.remove();
      markers.current.clear();
      for (const pin of pins) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "glohaus-locator-pin";
        button.textContent = "";
        button.title = pin.label + (pin.priceLabel ? " · From " + pin.priceLabel : "");
        button.setAttribute("aria-label", "Select " + pin.label);
        button.setAttribute("aria-pressed", String(selectedId === pin.id));
        if (selectedId === pin.id || highlightedId === pin.id) button.classList.add("is-selected");
        button.addEventListener("click", () => onSelectRef.current(pin.id));
        button.addEventListener("mouseenter", () => onHighlightRef.current?.(pin.id));
        button.addEventListener("mouseleave", () => onHighlightRef.current?.(null));
        const marker = new Marker({ element: button, anchor: "bottom" })
          .setLngLat([pin.longitude, pin.latitude]).addTo(instance);
        markers.current.set(pin.id, marker);
      }
    });
    return () => { removed = true; };
  }, [pins, selectedId, highlightedId, consented, ready]);

  const selected = pins.find((pin) => pin.id === selectedId);
  return (
    <section className="glohaus-locator" aria-label="Interactive professional locator map">
      {!consented ? (
        <div className="geo-map-gate">
          <h3>Explore beauty professionals on the map</h3>
          <p>Load the street map to explore London and beyond. OpenStreetMap receives your viewed area and IP address.</p>
          <button type="button" className="button secondary" onClick={() => setConsented(true)}>Load street map</button>
          <Link href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank">Map privacy</Link>
        </div>
      ) : (
        <>
          <div ref={mapContainer} className="glohaus-locator-canvas" />
          {error && <div className="glohaus-locator-error" role="alert">Map tiles may be unavailable. You can still browse professional listings.</div>}
          {selected && <div className="glohaus-locator-selected" aria-live="polite">
            <strong>{selected.label}</strong>
            <span>{selected.priceLabel ? "From " + selected.priceLabel : "View services and pricing"}</span>
          </div>}
        </>
      )}
    </section>
  );
}
