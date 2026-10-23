// This is Next.js's actual pending-route fallback: the logo disappears when
// the requested page renders, not after a decorative or fixed-duration timer.
export default function Loading() {
  return (
    <main id="main" className="glohaus-route-loading" role="status" aria-label="Loading GLOHAUS">
      <div className="glohaus-route-loading-content">
        <img
          className="glohaus-route-logo glohaus-route-logo-light"
          src="/images/glohaus-splash-light.svg"
          width="440"
          height="260"
          alt="GLOHAUS"
        />
        <img
          className="glohaus-route-logo glohaus-route-logo-night"
          src="/images/glohaus-splash-night.svg"
          width="440"
          height="260"
          alt=""
          aria-hidden="true"
        />
        <span className="glohaus-route-loading-spinner" aria-hidden="true" />
        <span className="sr-only">Loading, please wait.</span>
      </div>
    </main>
  );
}
