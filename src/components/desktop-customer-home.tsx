import Image from "next/image";
import Link from "next/link";
import {
  Bell, CalendarDays, ChevronRight, Heart, Home, MapPin,
  MessageSquare, Search, ShoppingBag, UserRound, WalletCards, Crown, Gift,
} from "lucide-react";
import { Brand } from "./brand";
import type { PublicProfessional } from "@/modules/professionals/domain";

const serviceTiles = [
  ["Hair","https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=240&q=80"],
  ["Nails","https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=240&q=80"],
  ["Barber","https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=240&q=80"],
  ["Waxing","https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=240&q=80"],
  ["Injectables","https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=240&q=80"],
] as const;
const fallbackPros = [
  ["Sienna Beauty","Hair Specialist","London","https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=700&q=85"],
  ["Amelia Nails","Nail Technician","Manchester","https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85"],
  ["Luxe Faces","Makeup Artist","Birmingham","https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=700&q=85"],
  ["Dev Cuts","Barber","London","https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=85"],
] as const;
const trends = [
  ["The Hair Edit","Trending styles this season","https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=700&q=85"],
  ["Nail Inspiration","Ideas from top artists","https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=700&q=85"],
  ["Beauty Looks","Real clients, real results","https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=700&q=85"],
  ["Top Rated Salons","Near you","https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=700&q=85"],
] as const;

export function DesktopCustomerHome({ professionals = [], signedIn = false, displayName = "" }: {
  professionals?: PublicProfessional[]; signedIn?: boolean; displayName?: string;
}) {
  const cards = professionals.length
    ? professionals.slice(0, 4).map((item, index) => ({
        id: item.id,
        name: item.business_name,
        role: item.category,
        city: item.city,
        slug: item.slug,
        image: item.photo_id
          ? `/api/media/${item.photo_id}`
          : fallbackPros[index % fallbackPros.length][3],
        unoptimized: Boolean(item.photo_id),
        rating: item.rating ? Number(item.rating).toFixed(1) : ["4.9", "4.8", "5.0", "4.9"][index],
      }))
    : fallbackPros.map(([name, role, city, image], index) => ({
        id: `fallback-${index}`,
        name,
        role,
        city,
        slug: "",
        image,
        unoptimized: false,
        rating: ["4.9", "4.8", "5.0", "4.9"][index],
      }));
  return <div className="desktop-customer-home">
    <aside className="customer-desktop-sidebar">
      <Brand />
      <nav aria-label="Customer navigation">
        <Link className="active" href="/"><Home size={20}/>Home</Link>
        <Link href="/explore"><Search size={20}/>Explore</Link>
        <Link href="/account/bookings"><CalendarDays size={20}/>Bookings</Link>
        <Link href="/messages"><MessageSquare size={20}/>Messages</Link>
        <Link href="/shop"><ShoppingBag size={20}/>Shop</Link>
        <span className="customer-nav-disabled" aria-disabled="true"><WalletCards size={20}/>Wallet<small>Coming soon</small></span>
        <Link href="/workspace"><UserRound size={20}/>Profile</Link>
      </nav>
      <div className="glohaus-plus-card glohaus-plus-disabled" aria-disabled="true">
        <Crown size={22}/><span><strong>GloHaus+</strong><small>Planned membership perks · Coming soon</small></span>
      </div>
    </aside>

    <main className="customer-desktop-main">
      <header className="customer-desktop-topbar">
        <span />
        <div><Link href="/notifications" aria-label="Notifications"><Bell size={21}/></Link>
        <Link className="desktop-user-chip" href="/workspace"><span className="desktop-avatar">{displayName ? displayName[0]?.toUpperCase() : "G"}</span>{signedIn ? displayName || "My account" : "Sign in"}<ChevronRight size={15}/></Link></div>
      </header>

      <section className="desktop-hero" style={{ position: "relative" }}>
        <div className="desktop-hero-copy"><p className="eyebrow">BEAUTY SERVICES NEAR YOU</p><h1>Good afternoon <Heart size={36}/></h1>
        <p>Find and book trusted beauty professionals,<br/>shop your favourites and feel your best — all in one place.</p>
        <form action="/explore" className="desktop-hero-search"><Search size={20}/><input name="q" aria-label="Search beauty" placeholder="Find hair, nails, beauty & more"/><button>Search</button></form></div>
        <Image fill priority sizes="60vw" src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1600&q=88" alt="Beauty inspiration portrait"/>
      </section>

      <nav className="desktop-service-row" aria-label="Beauty services">
        {serviceTiles.map(([label,img])=><Link href={"/explore?q="+encodeURIComponent(label)} key={label}><span><Image fill sizes="100px" src={img} alt=""/></span><strong>{label}</strong></Link>)}
        <Link href="/explore"><span className="desktop-view-all"><ChevronRight/></span><strong>View all</strong></Link>
      </nav>

      <section className="desktop-section">
        <div className="desktop-section-title"><h2>Recommended professionals</h2><Link href="/explore">See all <ChevronRight size={15}/></Link></div>
        <div className="desktop-pro-grid">
          {cards.map((card) => (
            <article className="desktop-pro-card" key={card.id}>
              <Link href={card.slug ? `/p/${card.slug}` : "/explore"} className="desktop-pro-photo">
                <Image fill sizes="260px" src={card.image} alt={card.name} unoptimized={card.unoptimized}/>
                <Heart className="desktop-card-heart" size={23}/>
                <span className="desktop-rating">★ {card.rating}</span>
              </Link>
              <div>
                <strong>{card.name}</strong><span>{card.role}</span>
                <small><MapPin size={13}/>{card.city}</small>
                <Link className="desktop-book" href={card.slug ? `/p/${card.slug}` : "/explore"}>Book</Link>
              </div>
            </article>
          ))}        </div>
      </section>

      <section className="desktop-section desktop-trending">
        <div className="desktop-section-title"><h2>Trending near you</h2><Link href="/explore">See all <ChevronRight size={15}/></Link></div>
        <div className="desktop-trend-grid">{trends.map(([title,sub,img])=><Link href="/explore" key={title}><Image fill sizes="300px" src={img} alt=""/><span><strong>{title}</strong><small>{sub}</small></span><i><ChevronRight size={18}/></i></Link>)}</div>
      </section>
    </main>

    <aside className="customer-desktop-rail">
      <section><div className="rail-heading"><h2>Upcoming Booking</h2><Link href="/account/bookings">View all →</Link></div>
        <div className="rail-empty-booking"><CalendarDays size={25}/><div><strong>{signedIn?"Your next appointment":"Ready when you are"}</strong><span>{signedIn?"Your upcoming booking will appear here.":"Sign in to see your bookings."}</span></div></div>
        <Link className="rail-soft-button" href={signedIn?"/account/bookings":"/sign-in"}>{signedIn?"View bookings":"Sign in"}<ChevronRight size={16}/></Link>
      </section>
      <section><div className="rail-heading"><h2>Messages</h2><Link href="/messages">Open →</Link></div>
        <div className="rail-message"><span className="desktop-avatar">G</span><div><strong>Private conversations</strong><small>Message professionals and keep booking conversations together.</small></div></div>
        <Link className="rail-soft-button" href="/messages">Open messages<ChevronRight size={16}/></Link>
      </section>
      <section><div className="rail-heading"><h2>Wallet & Rewards</h2><span className="rail-coming-soon">Coming soon</span></div>
        <div className="rail-wallet rail-wallet-disabled"><WalletCards/><div><small>Wallet</small><strong>Not active yet</strong></div><span>Roadmap stage 8</span></div>
        <div className="rail-reward rail-reward-disabled"><Gift/><span><strong>GloHaus Rewards</strong><small>Rewards will launch with the wallet experience.</small></span></div>
      </section>
      <Link className="desktop-shop-banner" href="/shop"><div><strong>Shop Beauty<br/>Essentials</strong><span>Curated products from trusted professionals.</span><b>Shop Now →</b></div><Image fill sizes="320px" src="https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=85" alt="Beauty products"/></Link>
    </aside>
    <footer className="desktop-status"><Brand/><span>v1.0.0</span><span className="status-right">GloHaus beta&nbsp; • &nbsp;Features unlock as they are validated</span></footer>
  </div>;
}
