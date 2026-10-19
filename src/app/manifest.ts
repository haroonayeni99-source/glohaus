import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GLOHAUS",
    short_name: "GLOHAUS",
    description: "Your GLOHAUS bookings, beauty business and community.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#e95f96",
    theme_color: "#e95f96",
    icons: [
      {
        src: "/icons/glohaus-home-192-v2.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/glohaus-home-512-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/glohaus-home-maskable-512-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
