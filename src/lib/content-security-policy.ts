export function contentSecurityPolicy(nonce: string, development = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' https: data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Media providers, map tiles, authenticated storage uploads and LiveKit can
    // use operator-configured HTTPS/WSS origins. Executable scripts still need
    // an unpredictable nonce; do not weaken script-src to allow all HTTPS.
    `connect-src 'self' https: wss:${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "media-src 'self' https: blob: data:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://*.stripe.com https://*.link.com https://vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://connect.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
