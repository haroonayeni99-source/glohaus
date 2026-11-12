import { LoadingDots } from "./loading-dots";
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
        className={`glohaus-page-pending glohaus-page-pending--dots glohaus-page-pending--${area}`}
        data-glohaus-route-pending
        aria-busy="true"
      >
        <div className="glohaus-page-pending-centre">
          <LoadingDots />
          <span className="sr-only">
            Loading {area === "home" ? "this page" : titles[area].toLowerCase()}…
          </span>
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
