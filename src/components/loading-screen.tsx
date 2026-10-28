export function LoadingScreen({ initial = false }: { initial?: boolean }) {
  return (
    <main id={initial ? undefined : "main"} className="glohaus-route-loading" role="status" aria-label="Loading GLOHAUS">
      <div className="glohaus-route-loading-content">
        <div className="glohaus-route-wordmark" aria-hidden="true">
          <img className="glohaus-route-wordmark-light" src="/images/glohaus-wordmark.png" alt="" width="1220" height="1020" />
          <img className="glohaus-route-wordmark-night" src="/images/glohaus-wordmark-night.png" alt="" width="2048" height="768" />
          <span className="glohaus-route-reflection" />
        </div>
        <p className="glohaus-route-slogan">Look Good. Feel Good. Stand Out.</p>
        <span className="glohaus-route-loading-indicator" aria-hidden="true"><span /></span>
        <span className="sr-only">Loading, please wait.</span>
      </div>
    </main>
  );
}
