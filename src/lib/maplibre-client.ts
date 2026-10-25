"use client";

export async function loadMapLibre() {
  const library = await import("maplibre-gl");
  // MapLibre 6 no longer embeds its worker in the main bundle. The matching
  // ESM worker and its relative chunks are copied from the locked package.
  library.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
  return library;
}

// Check the actual graphics context: exposing the WebGL constructor alone does
// not mean a device or restricted browser can create a working renderer.
export function supportsMapGraphics(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
