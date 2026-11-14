import React from "react";
import { createRoot } from "react-dom/client";
import { OurWork } from "@/components/our-work";
import type { PublicSocialPost } from "@/modules/business-tools/domain";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
const post: PublicSocialPost = {
  id: "posted", platform: "instagram", original_url: "https://www.instagram.com/p/EXAMPLE/", caption: "Published makeup",
  source_created_at: null, service_id: "makeup-service", publication_status: "published", sort_order: 0,
  featured: true, media_type: "image", has_thumbnail: true, professional_id: "fictional", slug: "fictional",
  business_name: "Example beauty", service_name: "Makeup", price_pence: 5000,
};
createRoot(document.getElementById("root")!).render(<main className="professional-public">
  <OurWork businessName="Example beauty" assets={[
    {id: "hair-photo", alt_text: "Hair photo", media_type: "image", speciality_ids: ["hair"]},
    {id: "hair-video", alt_text: "Hair video", media_type: "video", speciality_ids: ["hair"]},
  ]} posts={[post, {...post, id:"draft", caption:"PRIVATE DRAFT", publication_status:"draft"}]}
    services={[{id:"makeup-service", speciality_id:"makeup"}]}
    collections={[{id:"hair",name:"Hair"},{id:"makeup",name:"Makeup"}]} />
</main>);
