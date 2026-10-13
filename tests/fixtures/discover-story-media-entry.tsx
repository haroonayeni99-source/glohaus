import React from "react";
import { createRoot } from "react-dom/client";
import { PostEditor } from "@/components/post-editor";
import { StoryEditor } from "@/components/story-editor";
import { DiscoveryFeed } from "@/components/discovery-feed";
import type { PublicPost } from "@/modules/posts/domain";
import type { PublicStory } from "@/modules/stories/domain";
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") || "light";
const pro = "11111111-1111-4111-8111-111111111111";
function items(key: string) {
  return JSON.parse(sessionStorage.getItem(key) || "[]");
}
function store(key: string, value: unknown) {
  sessionStorage.setItem(key, JSON.stringify(value));
}
window.fetch = async (url, init) => {
  const path = String(url);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const records = items("requests");
  records.push({ url: path, body });
  store("requests", records);
  if (path.startsWith("/api/v1/professional/portfolio?")) {
    if (!sessionStorage.getItem("registered-once")) {
      sessionStorage.setItem("registered-once", "1");
      return Response.json({ processing: true }, { status: 202 });
    }
    const asset = {
      id: crypto.randomUUID(),
      alt_text: "Video of finished work",
      media_type: "video",
      publication_status: "draft",
    };
    store("assets", [...items("assets"), asset]);
    return Response.json({ asset });
  }
  if (path === "/api/v1/professional/portfolio") {
    const asset = {
      id: crypto.randomUUID(),
      alt_text: body.altText,
      media_type: "image",
      publication_status: "draft",
    };
    store("assets", [...items("assets"), asset]);
    return Response.json({ id: asset.id }, { status: 201 });
  }
  if (path === "/api/v1/professional/posts") {
    if (sessionStorage.getItem("fail-post")) {
      sessionStorage.removeItem("fail-post");
      return Response.json({}, { status: 503 });
    }
    const media = items("assets").find(
      (a: { id: string }) => a.id === body.assetId,
    );
    store("posts", [
      ...items("posts"),
      {
        id: crypto.randomUUID(),
        ...body,
        asset_id: body.assetId,
        asset_media_type: media?.media_type,
        slug: "test-studio",
        business_name: "Test Studio",
        professional_id: pro,
        city: "London",
        category: "Nails",
        service_id: null,
        service_name: null,
        price_pence: null,
      },
    ]);
    return Response.json({ saved: true });
  }
  if (path === "/api/v1/professional/stories") {
    const media = items("assets").find(
      (a: { id: string }) => a.id === body.assetId,
    );
    store("stories", [
      ...items("stories"),
      {
        id: crypto.randomUUID(),
        ...body,
        asset_id: body.assetId,
        media_type: media?.media_type,
        slug: "test-studio",
        business_name: "Test Studio",
        professional_id: pro,
        city: "London",
        category: "Nails",
        service_id: null,
        service_name: null,
        price_pence: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);
    return Response.json({ saved: true });
  }
  return Response.json({});
};
createRoot(document.getElementById("root")!).render(
  location.pathname === "/discover" ? (
    <DiscoveryFeed
      publishedPosts={items("posts") as PublicPost[]}
      stories={items("stories") as PublicStory[]}
      routeBase="/discover"
      hideEditorial
      accountMode
      viewerSignedIn
      canPublish
    />
  ) : (
    <main className="pro-main pro-management-page">
      <h1>Discover posts and Stories</h1>
      <section id="post-editor">
        <PostEditor posts={[]} services={[]} assets={[]} />
      </section>
      <section id="story-editor">
        <StoryEditor stories={[]} services={[]} assets={[]} />
      </section>
    </main>
  ),
);
