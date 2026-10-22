"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  project,
  unproject,
  distanceMiles,
  type Coordinates,
} from "@/modules/professionals/location";

type Pin = Coordinates & {
  id: string;
  label: string;
  href?: string;
  priceLabel?: string;
};
export type MapViewport = Coordinates & { radiusMiles: number };
export function GeographicMap({
  pins = [],
  focus,
  initialZoom = 12,
  focusZoom,
  onChoose,
  selectedId,
  highlightedId,
  onSelect,
  onHighlight,
  onViewportChange,
}: {
  pins?: Pin[];
  focus?: Coordinates;
  initialZoom?: number;
  focusZoom?: number;
  onChoose?: (point: Coordinates) => void;
  selectedId?: string | null;
  highlightedId?: string | null;
  onSelect?: (id: string) => void;
  onHighlight?: (id: string | null) => void;
  onViewportChange?: (viewport: MapViewport) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [center, setCenter] = useState<Coordinates>(
    focus ?? pins[0] ?? { latitude: 51.5074, longitude: -0.1278 },
  );
  const [zoom, setZoom] = useState(initialZoom);
  const [size, setSize] = useState({ width: 320, height: 360 });
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; center: Coordinates } | null>(
    null,
  );
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const [lastFocus, setLastFocus] = useState(focus);
  if (
    focus &&
    (focus.latitude !== lastFocus?.latitude ||
      focus.longitude !== lastFocus?.longitude)
  ) {
    setLastFocus(focus);
    setCenter({ latitude: focus.latitude, longitude: focus.longitude });
    if (focusZoom != null) setZoom(focusZoom);
  }
  useEffect(() => {
    if (!surface.current || !loaded) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [loaded]);
  const c = project(center, zoom);
  useEffect(() => {
    const p = project(center, zoom);
    onViewportChange?.({
      ...center,
      radiusMiles: Math.max(
        0.5,
        Math.min(
          100,
          distanceMiles(
            center,
            unproject(p.x + size.width / 2, p.y + size.height / 2, zoom),
          ),
        ),
      ),
    });
  }, [center, zoom, size, onViewportChange]);
  const left = c.x - size.width / 2,
    top = c.y - size.height / 2;
  const tiles = [];
  if (loaded && !failed)
    for (
      let x = Math.floor(left / 256);
      x <= Math.floor((left + size.width) / 256);
      x++
    )
      for (
        let y = Math.floor(top / 256);
        y <= Math.floor((top + size.height) / 256);
        y++
      ) {
        const count = 2 ** zoom;
        if (y < 0 || y >= count) continue;
        tiles.push({
          x,
          y,
          url: `https://tile.openstreetmap.org/${zoom}/${((x % count) + count) % count}/${y}.png`,
        });
      }
  function zoomAt(nextZoom: number, clientX?: number, clientY?: number) {
    const targetZoom = Math.max(2, Math.min(19, nextZoom));
    if (targetZoom === zoom) return;
    const box = surface.current?.getBoundingClientRect();
    const offsetX = box && clientX != null ? clientX - box.left - box.width / 2 : 0;
    const offsetY = box && clientY != null ? clientY - box.top - box.height / 2 : 0;
    const projected = project(center, zoom);
    const anchor = unproject(projected.x + offsetX, projected.y + offsetY, zoom);
    const nextAnchor = project(anchor, targetZoom);
    setCenter(unproject(nextAnchor.x - offsetX, nextAnchor.y - offsetY, targetZoom));
    setZoom(targetZoom);
  }
  function move(dx: number, dy: number) {
    setCenter(unproject(c.x + dx, c.y + dy, zoom));
  }
  if (!loaded)
    return (
      <section className="geo-map-gate" aria-label="Street map">
        <h3>
          {onChoose
            ? "Choose your public business pin"
            : "Professional-confirmed locations"}
        </h3>
        <p>
          Load the street map to{" "}
          {onChoose
            ? "zoom in and select your studio"
            : "see actual public business pins"}
          . OpenStreetMap receives the map area you view and your IP address.
        </p>
        <button
          className="button secondary"
          type="button"
          onClick={() => setLoaded(true)}
        >
          Load street map
        </button>
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
      className="geo-map"
      aria-label={
        onChoose
          ? "Choose a public business location"
          : "Map of confirmed professional locations"
      }
    >
      <div
        className="geo-map-surface"
        data-center-latitude={center.latitude}
        data-center-longitude={center.longitude}
        data-zoom={zoom}
        ref={surface}
        style={{ touchAction: "none" }}
        onWheel={(event) => {
          if (event.deltaY !== 0) {
            event.preventDefault();
            zoomAt(zoom + (event.deltaY < 0 ? 1 : -1), event.clientX, event.clientY);
          }
        }}
        onPointerDown={(event) => {
          activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (activePointers.current.size > 1) {
            drag.current = null;
            const points = [...activePointers.current.values()];
            pinchDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, y: event.clientY, center };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (activePointers.current.has(event.pointerId)) activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (activePointers.current.size > 1) {
            const points = [...activePointers.current.values()];
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            if (pinchDistance.current && distance > pinchDistance.current * 1.35) {
              zoomAt(zoom + 1, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
              pinchDistance.current = distance;
            } else if (pinchDistance.current && distance < pinchDistance.current / 1.35) {
              zoomAt(zoom - 1, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
              pinchDistance.current = distance;
            }
            return;
          }
          const start = drag.current;
          if (!start) return;
          const p = project(start.center, zoom);
          setCenter(
            unproject(
              p.x + start.x - event.clientX,
              p.y + start.y - event.clientY,
              zoom,
            ),
          );
        }}
        onPointerUp={(event) => {
          const pinching = activePointers.current.size > 1;
          activePointers.current.delete(event.pointerId);
          if (activePointers.current.size < 2) pinchDistance.current = null;
          const start = pinching ? null : drag.current;
          drag.current = null;
          if (!start) return;
          const delta = Math.hypot(
            event.clientX - start.x,
            event.clientY - start.y,
          );
          if (delta < 12 && event.pointerType === "touch" && !onChoose) {
            const previous = lastTap.current;
            const now = Date.now();
            if (previous && now - previous.time < 350 && Math.hypot(previous.x - event.clientX, previous.y - event.clientY) < 35) {
              lastTap.current = null;
              zoomAt(zoom + 1, event.clientX, event.clientY);
            } else {
              lastTap.current = { time: now, x: event.clientX, y: event.clientY };
            }
          }
          if (delta < 5 && onChoose && zoom >= 16) {
            const box = event.currentTarget.getBoundingClientRect();
            onChoose(
              unproject(
                left + event.clientX - box.left,
                top + event.clientY - box.top,
                zoom,
              ),
            );
          }
        }}
        onPointerCancel={(event) => {
          activePointers.current.delete(event.pointerId);
          pinchDistance.current = null;
          drag.current = null;
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          if (event.detail > 0) zoomAt(zoom + 1, event.clientX, event.clientY);
        }}
      >
        {tiles.map((tile) => (
          <Image
            key={`${zoom}-${tile.x}-${tile.y}`}
            src={tile.url}
            alt=""
            unoptimized
            draggable={false}
            referrerPolicy="strict-origin-when-cross-origin"
            width={256}
            height={256}
            style={{ left: tile.x * 256 - left, top: tile.y * 256 - top }}
            onError={() => setFailed(true)}
          />
        ))}
        {pins.map((pin) => {
          const p = project(pin, zoom);
          const world = 256 * 2 ** zoom;
          const dx =
            ((((p.x - c.x + world / 2) % world) + world) % world) - world / 2;
          const x = size.width / 2 + dx,
            y = p.y - top;
          if (x < 0 || x > size.width || y < 0 || y > size.height) return null;
          if (onSelect)
            return (
              <button
                type="button"
                key={pin.id}
                className={`geo-pin geo-price-pin${selectedId === pin.id || highlightedId === pin.id ? " is-selected" : ""}`}
                style={{ left: x, top: y }}
                aria-label={`${pin.label}${pin.priceLabel ? `, from ${pin.priceLabel}` : ""}`}
                aria-pressed={selectedId === pin.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(pin.id)}
                onMouseEnter={() => onHighlight?.(pin.id)}
                onMouseLeave={() => onHighlight?.(null)}
                onFocus={() => onHighlight?.(pin.id)}
                onBlur={() => onHighlight?.(null)}
              >
                {pin.priceLabel ?? "View"}
              </button>
            );
          return pin.href ? (
            <Link
              key={pin.id}
              className="geo-pin"
              style={{ left: x, top: y }}
              href={pin.href}
              title={pin.label}
              aria-label={`View ${pin.label}`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {pin.label.slice(0, 1)}
            </Link>
          ) : (
            <span
              key={pin.id}
              className="geo-pin"
              style={{ left: x, top: y }}
              title={pin.label}
              aria-label={pin.label}
            >
              ●
            </span>
          );
        })}
        {onChoose && (
          <span className="geo-crosshair" aria-hidden>
            +
          </span>
        )}
        {failed && (
          <p className="geo-map-error" role="status">
            Street tiles are unavailable.{" "}
            {onChoose
              ? "Try the map again or use your device at the studio."
              : "The professional list and distances are still available."}{" "}
            <button type="button" onClick={() => setFailed(false)}>
              Retry map
            </button>
          </p>
        )}
      </div>
      <div className="geo-controls" aria-label="Street map controls">
        <button
          type="button"
          aria-label="Zoom in street map"
          disabled={zoom >= 19}
          onClick={() => setZoom((z) => z + 1)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out street map"
          disabled={zoom <= 2}
          onClick={() => setZoom((z) => z - 1)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Move street map left"
          onClick={() => move(-size.width / 3, 0)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Move street map right"
          onClick={() => move(size.width / 3, 0)}
        >
          →
        </button>
        <button
          type="button"
          aria-label="Move street map up"
          onClick={() => move(0, -size.height / 3)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move street map down"
          onClick={() => move(0, size.height / 3)}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => {
            setCenter(
              focus ?? pins[0] ?? { latitude: 51.5074, longitude: -0.1278 },
            );
            setZoom(initialZoom);
          }}
        >
          Reset map
        </button>
      </div>
      {onChoose && (
        <div className="geo-map-pick">
          <button
            type="button"
            className="button secondary"
            disabled={zoom < 16 || failed}
            onClick={() => onChoose(center)}
          >
            Use pin at map centre
          </button>
          <small>
            {zoom < 16
              ? "Zoom in to street level to choose an accurate pin."
              : "Tap your studio on the map, or move the crosshair and use the centre pin."}
          </small>
        </div>
      )}
      <div className="geo-attribution">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
        >
          Report a map issue
        </a>
      </div>
    </section>
  );
}
