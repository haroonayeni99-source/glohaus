import Image from "next/image";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Brand } from "./brand";
import { BottomNavigation } from "./bottom-navigation";

const mobileCategories = [
  ["Hair", "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=240&q=82"],
  ["Nails", "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=240&q=82"],
  ["Lashes", "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=240&q=82"],
  ["Skin", "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=240&q=82"],
  ["Makeup", "https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=240&q=82"],
] as const;

export function MobileCustomerHome() {
  return (
    <div className="mobile-customer-home">
      <main id="main" className="mobile-home-main">
        <header className="mobile-home-header">
          <div className="mobile-home-brand">
            <Brand inverse />
            <span>Beauty. Book. Shop. Belong.</span>
          </div>
          <Link
            className="mobile-home-bell"
            href="/notifications"
            aria-label="Notifications"
          >
            <Bell size={21} aria-hidden />
          </Link>
        </header>

        <form className="mobile-home-search" action="/explore" role="search">
          <Search size={18} aria-hidden />
          <label className="sr-only" htmlFor="mobile-home-query">
            Search services or professionals
          </label>
          <input
            id="mobile-home-query"
            name="q"
            placeholder="Search services, professionals..."
          />
        </form>

        <nav className="mobile-home-categories" aria-label="Beauty categories">
          {mobileCategories.map(([label, image]) => (
            <Link href={`/explore?q=${encodeURIComponent(label)}`} key={label}>
              <span>
                <Image fill sizes="64px" src={image} alt="" />
              </span>
              <strong>{label}</strong>
            </Link>
          ))}
        </nav>

        <section className="mobile-home-hero">
          <Image
            fill
            priority
            sizes="100vw"
            src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1100&q=90"
            alt="Beauty inspiration portrait"
          />
          <div className="mobile-home-hero-shade" />
          <div className="mobile-home-hero-copy">
            <h1>
              Real Beauty
              <br />
              Real People
              <br />
              Real Results
            </h1>
            <Link className="mobile-home-glow" href="/discover">
              Find Your Glow
            </Link>
          </div>
        </section>

        <Link className="mobile-home-discover-link" href="/discover">
          Discover more beauty inspiration
          <span aria-hidden>→</span>
        </Link>
      </main>
      <BottomNavigation active="home" />
    </div>
  );
}
