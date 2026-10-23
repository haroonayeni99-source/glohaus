"use client";

export async function loadMapLibre() {
  const library = await import("maplibre-gl");
  // MapLibre 6 no longer embeds its worker in the main bundle. The matching
  // ESM worker and its relative chunks are copied from the locked package.
  library.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
  return library;
}
