import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [{source:"/sw.js",headers:[{key:"Content-Type",value:"application/javascript; charset=utf-8"},{key:"Cache-Control",value:"no-cache, no-store, must-revalidate"},{key:"Service-Worker-Allowed",value:"/"},{key:"Content-Security-Policy",value:"default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'"}]},{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ] }];
  },
};
export default config;
