"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { MapPin } from "lucide-react";
import {
  discoveryHref,
  type DiscoveryFilters,
} from "@/modules/professionals/discovery";
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

export function LondonMapOverview({
  query,
  filters,
}: {
  query: string;
  filters: DiscoveryFilters;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedArea, setSelectedArea] = useState(filters.location ?? "");
  return (
    <div
      className="glohaus-map london-overview"
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
        <span className="map-borough-label map-label-hackney">HACKNEY</span>
        <span className="map-borough-label map-label-westminster">
          WESTMINSTER
        </span>
        <span className="map-borough-label map-label-lewisham">LEWISHAM</span>

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
          onClick={() => setPan((p) => ({ ...p, x: Math.max(-160, p.x - 60) }))}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Move map right"
          onClick={() => setPan((p) => ({ ...p, x: Math.min(160, p.x + 60) }))}
        >
          →
        </button>
        <button
          type="button"
          aria-label="Move map up"
          onClick={() => setPan((p) => ({ ...p, y: Math.max(-160, p.y - 60) }))}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move map down"
          onClick={() => setPan((p) => ({ ...p, y: Math.min(160, p.y + 60) }))}
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
            {selectedArea ? `Search ${selectedArea}` : "Search all areas"} →
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
  );
}
