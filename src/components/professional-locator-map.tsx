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
        style: {
          version: 8,
          sources: { streets: {
            type: "raster",
            tiles: [darkMode
              ? "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO",
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
    if (currentFocus.current?.latitude === focus.latitude &&
        currentFocus.current?.longitude === focus.longitude && resetLondonSignal === 0) return;
    currentFocus.current = focus;
    instance.flyTo({
      center: [focus.longitude, focus.latitude],
      zoom: resetLondonSignal ? 10 : selectedId ? 14 : 10,
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
