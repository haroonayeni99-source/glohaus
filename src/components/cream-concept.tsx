"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Compass,
  Heart,
  MapPin,
  Search,
  Share2,
  ShoppingBag,
  Star,
} from "lucide-react";
import { inspiration } from "@/modules/discovery/inspiration";

const filters = ["For you", "Hair", "Nails", "Makeup", "Lashes & brows"];

/** A separate original visual direction using editorial imagery only. */
export function CreamConcept() {
  const [filter, setFilter] = useState("For you");
  const [saved, setSaved] = useState(false);
  const look = useMemo(
    () =>
      inspiration.find(
        (item) => filter === "For you" || item.category === filter,
      ) ?? inspiration[0],
    [filter],
  );
  return (
    <main className="cream-concept" id="main">
      <section className="cream-concept-hero">
        <div>
          <p className="eyebrow">CREAM VISUAL DIRECTION · GLOHAUS</p>
          <h1>Beauty that feels part of every day.</h1>
          <p>
            An original cream-colour direction for the GLOHAUS website and
            future mobile app: scroll to discover, know who created the look,
            and book only when it feels right.
          </p>
        </div>
        <div className="cream-concept-actions">
          <Link className="button" href="/">
            Open working discovery <ChevronRight size={18} />
          </Link>
          <span>Visual concept only — your live data stays private.</span>
        </div>
      </section>
      <nav className="cream-concept-nav" aria-label="Concept sections">
        <span className="cream-wordmark">
          GLOHAUS
        </span>
        <div>
          <a href="#discover">
            <Compass size={17} /> Discover
          </a>
          <a href="#professional">
            <Star size={17} /> Profiles
          </a>
          <a href="#book">
            <CalendarDays size={17} /> Book
          </a>
          <a href="#shop">
            <ShoppingBag size={17} /> Shop
          </a>
        </div>
      </nav>
      <section
        className="cream-concept-grid"
        aria-label="Cream website concept"
      >
        <article id="discover" className="cream-panel cream-feed-panel">
          <header>
            <span>01 / DISCOVER</span>
            <div className="cream-search">
              <Search size={17} />
              <span>Find a look, service or local professional</span>
            </div>
          </header>
          <div className="cream-pills" aria-label="Inspiration filters">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item}
                className={filter === item ? "active" : ""}
                key={item}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="cream-feed-card">
            <Image
              src={look.image}
              alt={look.alt}
              fill
              unoptimized
              sizes="(max-width: 700px) 100vw, 38vw"
              priority
            />
            <div className="cream-image-shade" />
            <div className="cream-feed-copy">
              <span className="cream-chip">{look.category} inspiration</span>
              <h2>{look.title}</h2>
              <p>{look.caption}</p>
              <Link href={`/explore?q=${encodeURIComponent(look.category)}`}>
                Find {look.category.toLowerCase()} professionals{" "}
                <ChevronRight size={16} />
              </Link>
            </div>
            <div className="cream-post-actions">
              <button aria-label="Like this inspiration">
                <Heart size={21} />
              </button>
              <button aria-label="Share this inspiration">
                <Share2 size={21} />
              </button>
              <button
                aria-label="Save this inspiration"
                aria-pressed={saved}
                onClick={() => setSaved((value) => !value)}
              >
                <Heart size={21} fill={saved ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
          <footer>
            Browse freely. Booking stays a clear, separate choice.
          </footer>
        </article>
        <article id="professional" className="cream-panel cream-profile-panel">
          <header>
            <span>02 / PROFESSIONAL PROFILE</span>
            <span className="cream-status">Public identity</span>
          </header>
          <div className="cream-profile-top">
            <div className="cream-avatar">g.</div>
            <div>
              <h2>Built around the artist.</h2>
              <p>
                <MapPin size={15} /> London · Public city only
              </p>
            </div>
          </div>
          <p className="cream-profile-bio">
            A dedicated place for a real portfolio, transparent services,
            reviews, availability and an intentional booking path.
          </p>
          <div className="cream-profile-tabs">
            <span className="active">Work</span>
            <span>Services</span>
            <span>Reviews</span>
          </div>
          <div className="cream-mini-grid">
            {inspiration.slice(0, 3).map((item) => (
              <Image
                key={item.id}
                src={item.image}
                alt="Editorial beauty inspiration"
                width={160}
                height={160}
                unoptimized
              />
            ))}
          </div>
          <Link className="cream-outline-button" href="/explore">
            Find a professional <ChevronRight size={16} />
          </Link>
        </article>
        <article id="book" className="cream-panel cream-book-panel">
          <header>
            <span>03 / SIMPLE BOOKING</span>
            <CalendarDays size={18} />
          </header>
          <h2>A quiet, clear way to book.</h2>
          <div className="cream-service-row">
            <div>
              <strong>Signature service</strong>
              <span>60 minutes</span>
            </div>
            <b>£45</b>
          </div>
          <div className="cream-service-row selected">
            <div>
              <strong>Your selected time</strong>
              <span>Tuesday · 11:00</span>
            </div>
            <b>
              <Star size={16} fill="currentColor" /> Available
            </b>
          </div>
          <p>
            Services, duration, price, deposit and availability remain visible
            before a customer commits.
          </p>
          <Link className="button" href="/explore">
            Choose a professional <ChevronRight size={18} />
          </Link>
        </article>
        <article id="shop" className="cream-panel cream-shop-panel">
          <header>
            <span>04 / SHOP</span>
            <span className="cream-status">Planned direct checkout</span>
          </header>
          <h2>Products next to the work that inspired them.</h2>
          <p>
            Future product cards will show the professional seller, price and
            fulfillment details distinctly from a service booking.
          </p>
          <div className="cream-shop-placeholder">
            <ShoppingBag size={28} />
            <strong>GLOHAUS shop</strong>
            <span>Awaiting seller and commerce setup</span>
          </div>
        </article>
      </section>
      <section className="cream-concept-note">
        <p>
          This concept takes the reference’s content structure — discovery,
          profile, post, booking and creator tools — while keeping the GLOHAUS
          name, original layout, colours and interactions.
        </p>
      </section>
    </main>
  );
}
