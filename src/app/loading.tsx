// This is Next.js's actual pending-route fallback: the logo disappears when
// the requested page renders, not after a decorative or fixed-duration timer.
export default function Loading() {
  return (
    <main id="main" className="glohaus-route-loading" role="status" aria-label="Loading GLOHAUS">
      <div className="glohaus-route-loading-content">
        <div className="glohaus-route-wordmark" aria-hidden="true">
          <img src="/images/glohaus-wordmark.png" alt="" width="1220" height="1020" />
        </div>
        <span className="glohaus-route-loading-spinner" aria-hidden="true" />
        <span className="sr-only">Loading, please wait.</span>
      </div>
    </main>
  );
}
