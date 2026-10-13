import React from "react";
import { createRoot } from "react-dom/client";
import { ProfessionalProfile } from "@/components/professional-profile";
import { DiscoveryFeed } from "@/components/discovery-feed";
import { PublicHeader } from "@/components/public-header";
import { professional, details, services } from "./mobile-audit/data";
import type { PublicPost } from "@/modules/posts/domain";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
const posts: PublicPost[] = [1, 2].map((i) => ({
  id: `post-${i}`, professional_id: professional.id, business_name: professional.business_name,
  slug: professional.slug, city: professional.city, category: professional.category,
  title: `Finished nail design ${i}`, body: "A fictional finished design for isolated video playback testing.",
  kind: "design", asset_id: `video-${i}`, asset_media_type: "video", service_id: null,
  service_name: null, price_pence: null,
}));
createRoot(document.getElementById("root")!).render(
  location.pathname === "/discover" ? <DiscoveryFeed publishedPosts={posts} routeBase="/discover" hideEditorial /> :
  <><PublicHeader /><ProfessionalProfile
    professional={professional} details={{ ...details, contact_email: "averylongprofessionalcontactaddress@example.test" }}
    services={services} assets={posts.map((p) => ({ id: p.asset_id!, alt_text: p.title, media_type: "video" }))}
    reviews={[]} hours={[{ weekday: 1, startMinute: 540, endMinute: 1020 }]} rating={null} reviewCount={0}
    follow={{ following: false, followerCount: 24, signedIn: false }} messageHref="/messages" bookingFeePence={100}
    presentation={{ profile_style: "signature", portfolio_layout: params.has("feature") ? "feature" : "grid", service_style: "cards" }}
    booking={<div className="booking-widget"><p className="eyebrow">BOOK YOUR APPOINTMENT</p><h2>Choose your service and time.</h2><p>Fictional booking preview only.</p></div>}
  /></>,
);
