import React from "react";
import { createRoot } from "react-dom/client";
import { BusinessConnections } from "@/components/business-connections";
import { ReviewForm } from "@/components/review-form";
import { OwnerSocialSync } from "@/components/owner-social-sync";
import { SocialPortfolio } from "@/components/social-portfolio";
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") || "light";
const id = "11111111-1111-4111-8111-111111111111";
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
    {query.get("view") === "owner" ? (
      <OwnerSocialSync
        initial={{
          enabled: true,
          accounts: [
            {
              provider: "instagram",
              connected: 1,
              successes: 2,
              failures: 1,
              reconnect: 0,
              last_success: "2026-10-26T12:00:00Z",
            },
          ],
          professionals: [
            {
              id,
              business_name: "Fictional studio",
              connected: 1,
              reconnect: 0,
              last_success: "2026-10-26T12:00:00Z",
              paused: false,
              reports: 1,
            },
          ],
        }}
      />
    ) : query.get("view") === "review" ? (
      <ReviewForm bookingId={id} />
    ) : query.get("view") === "social" ? (
      <SocialPortfolio
        compact
        posts={[0, 1, 2].map((index) => ({
          id: index ? `11111111-1111-4111-8111-11111111111${index + 1}` : id,
          featured: index === 0,
          has_thumbnail: true,
          media_type: "video",
          professional_id: id,
          slug: "fictional-studio",
          business_name: "Fictional studio",
          platform: "tiktok",
          original_url: "https://www.tiktok.com/@fictional/video/12345678",
          caption: `Fictional portfolio example ${index}`,
          source_created_at: null,
          service_id: id,
          service_name: "Manicure",
          price_pence: 4500,
          publication_status: "published",
          sort_order: 0,
        }))}
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
          {
            id: "22222222-2222-4222-8222-222222222222",
            provider: "instagram",
            label: "Fixture Instagram",
            status: "connected",
            auto_publish: false,
            export_bookings: false,
            last_success_at: null,
            last_error: null,
            social_mode: "approval",
            sync_enabled: true,
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
