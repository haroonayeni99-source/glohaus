import { PublicHeader } from "./public-header";
import { BottomNavigation } from "./bottom-navigation";

type Area = "home" | "discover" | "shop" | "profile" | "account" | "service";
const titles: Record<Area, string> = {
  home: "Your next beauty discovery",
  discover: "Get inspired",
  shop: "Shop beauty",
  profile: "Professional profile",
  account: "Your account",
  service: "Choose your appointment",
};
/** Data-free route shell: navigation stays available, private content is never guessed. */
export function PageLoading({ area = "home" }: { area?: Area }) {
  return (
    <>
      <PublicHeader />
      <main
        id="main"
        className={`glohaus-page-pending glohaus-page-pending--${area}`}
        data-glohaus-route-pending
        aria-busy="true"
      >
        <p role="status">
          Loading {area === "home" ? "this page" : titles[area].toLowerCase()}…
        </p>
        <div aria-hidden="true" className="glohaus-page-placeholder">
          <div className="glohaus-page-placeholder-heading" />
          <div className="glohaus-page-placeholder-line" />
          {area === "discover" ? (
            <div className="glohaus-page-placeholder-video" />
          ) : (
            <div className="glohaus-page-placeholder-grid">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glohaus-page-placeholder-card" />
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNavigation
        active={
          area === "discover"
            ? "discover"
            : area === "shop"
              ? "shop"
              : area === "account"
                ? "profile"
                : area === "home"
                  ? "home"
                  : undefined
        }
      />
    </>
  );
}
