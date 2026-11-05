export function LoadingScreen({ initial = false }: { initial?: boolean }) {
  return (
    <main id={initial ? undefined : "main"} className="glohaus-route-loading" role="status" aria-label="Loading GLOHAUS">
      <div className="glohaus-route-loading-content">
        <div className="glohaus-route-wordmark" aria-hidden="true">
          <span className="glohaus-loading-brand">GLOHAUS</span>
          <span className="glohaus-route-reflection" />
        </div>
        <p className="glohaus-route-slogan">Look Good. Feel Good. Stand Out.</p>
        <span className="glohaus-route-loading-indicator" aria-hidden="true"><span /></span>
        <span className="sr-only">Loading, please wait.</span>
      </div>
    </main>
  );
}
