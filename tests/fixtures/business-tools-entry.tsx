import React from "react";
import { createRoot } from "react-dom/client";
import { BusinessConnections } from "@/components/business-connections";
import { ReviewForm } from "@/components/review-form";
import { SocialPortfolio } from "@/components/social-portfolio";
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") || "light";
const id = "11111111-1111-4111-8111-111111111111";
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
    {query.get("view") === "review" ? (
      <ReviewForm bookingId={id} />
    ) : query.get("view") === "social" ? (
      <SocialPortfolio
        posts={[
          {
            id,
            professional_id: id,
            slug: "fictional-studio",
            business_name: "Fictional studio",
            platform: "tiktok",
            original_url: "https://www.tiktok.com/@fictional/video/12345678",
            caption: "Fictional portfolio example",
            source_created_at: null,
            service_id: id,
            service_name: "Manicure",
            price_pence: 4500,
            publication_status: "published",
            sort_order: 0,
          },
        ]}
      />
    ) : (
      <BusinessConnections
        connections={[
          {
            id,
            provider: "google",
            label: "Fixture calendar",
            status: "error",
            auto_publish: false,
            export_bookings: false,
            last_success_at: null,
            last_error: "RECONNECT_REQUIRED",
          },
        ]}
        posts={[
          {
            id,
            platform: "instagram",
            original_url: "https://www.instagram.com/p/ABC123/",
            caption: "Fictional nails",
            source_created_at: null,
            service_id: null,
            publication_status: "draft",
            sort_order: 0,
          },
        ]}
        preferences={{ buffer_minutes: 0, travel_buffer_minutes: 0 }}
        services={[{ id, name: "Manicure" }]}
        ready={{
          google: false,
          outlook: false,
          ics: true,
          instagram: false,
          tiktok: false,
        }}
      />
    )}
  </main>,
);
