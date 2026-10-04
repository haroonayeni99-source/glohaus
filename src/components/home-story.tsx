import Link from "next/link";
import { ArrowUpRight, Search, CalendarDays, Heart } from "lucide-react";

export function HomeStory() {
  return (
    <div className="home-story">
      <section className="home-how">
        <p className="eyebrow">YOUR BEAUTY, YOUR WAY</p>
        <h2>From inspiration to your next appointment.</h2>
        <div className="home-how-grid">
          <Link href="/discover">
            <Heart size={24} />
            <h3>Find your inspiration</h3>
            <p>Explore styles and discover the people behind the work.</p>
            <span>
              Browse the feed <ArrowUpRight size={16} />
            </span>
          </Link>
          <Link href="/explore">
            <Search size={24} />
            <h3>Meet your professional</h3>
            <p>Compare portfolios, services and prices at your own pace.</p>
            <span>
              Explore professionals <ArrowUpRight size={16} />
            </span>
          </Link>
          <Link href="/how-it-works">
            <CalendarDays size={24} />
            <h3>Make time for you</h3>
            <p>
              Choose a service and check the professional’s available
              appointments.
            </p>
            <span>
              How booking works <ArrowUpRight size={16} />
            </span>
          </Link>
        </div>
      </section>
      <section className="home-pro-invite">
        <div>
          <p className="eyebrow">GLOHAUS PRO · WORK • GROW • BELONG</p>
          <h2>Your talent deserves its own storefront.</h2>
          <p>
            Showcase your work, build your audience and manage your bookings in
            one place.
          </p>
        </div>
        <Link href="/sign-up?intent=professional">
          Grow your beauty business <ArrowUpRight size={18} />
        </Link>
      </section>
    </div>
  );
}
