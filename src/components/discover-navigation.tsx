import Link from "next/link";
export function DiscoverNavigation({ active, routeBase = "/discover" }: { active: "explore" | "following" | "saved" | "professionals"; routeBase?: string }) {
  return <nav className="discover-collection-nav workspace-section-links" aria-label="Your Discover collections">
    <Link href={routeBase} aria-current={active === "explore" ? "page" : undefined}>Explore inspiration</Link>
    <Link href={`${routeBase}?feed=following`} aria-current={active === "following" ? "page" : undefined}>Following feed</Link>
    <Link href={`${routeBase}?view=saved`} aria-current={active === "saved" ? "page" : undefined}>Saved looks</Link>
    <Link href="/account/following" aria-current={active === "professionals" ? "page" : undefined}>Followed professionals</Link>
    <Link href="/explore">Find a Professional →</Link>
  </nav>;
}
