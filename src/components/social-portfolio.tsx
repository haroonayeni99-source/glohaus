"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PublicSocialPost } from "@/modules/business-tools/domain";
import { socialPostLink } from "@/modules/business-tools/domain";
import { ContentReportButton } from "./content-report-button";
import "./business-tools.css";
function SocialThumbnail({
  post,
  small = false,
}: {
  post: PublicSocialPost;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={
        small ? "social-thumbnail social-thumbnail-small" : "social-thumbnail"
      }
    >
      {post.has_thumbnail && !failed ? (
        <Image
          src={`/api/v1/social-thumbnails/${post.id}`}
          alt={
            post.caption
              ? post.caption.slice(0, 160)
              : `${post.platform} work by ${post.business_name}`
          }
          width={640}
          height={480}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="social-thumbnail-placeholder">
          <span aria-hidden>{post.media_type === "video" ? "▶" : "◈"}</span>
          <span>
            {post.platform === "instagram" ? "Instagram work" : "TikTok video"}
          </span>
          <small>
            {failed
              ? "Preview unavailable — original link below"
              : post.has_thumbnail
                ? "Loading preview"
                : "Open the authorised embed to preview"}
          </small>
        </div>
      )}
    </div>
  );
}
function SocialCard({ post }: { post: PublicSocialPost }) {
  const [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false);
  let embed = "";
  try {
    const link = socialPostLink(post.original_url);
    embed =
      link.platform === "tiktok"
        ? `https://www.tiktok.com/player/v1/${link.externalId}?autoplay=0`
        : `${link.url}embed/`;
  } catch {
    return null;
  }
  return (
    <article className="social-portfolio-card">
      <SocialThumbnail post={post} />
      <p>
        <strong>
          {post.platform === "instagram" ? "Instagram" : "TikTok"}
        </strong>{" "}
        · <Link href={`/p/${post.slug}`}>{post.business_name}</Link>
      </p>
      {post.featured && (
        <span className="social-featured-badge">Featured work</span>
      )}
      <p>{post.caption}</p>
      {post.source_created_at ? (
        <small>
          Originally created{" "}
          {new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/London",
            dateStyle: "medium",
          }).format(new Date(post.source_created_at))}
        </small>
      ) : (
        <small>
          Manually shared post · original creation date not supplied
        </small>
      )}
      {loaded && !failed ? (
        <>
          <iframe
            src={embed}
            title={`${post.platform} work shared by ${post.business_name}`}
            loading="lazy"
            allow="fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setFailed(true)}
          />
          <button
            type="button"
            onClick={() => {
              setLoaded(false);
              setFailed(false);
            }}
          >
            Close embedded post
          </button>
        </>
      ) : (
        <>
          <p>
            Loading the post connects to{" "}
            {post.platform === "instagram" ? "Instagram" : "TikTok"}, which may
            use cookies. You can also open the original directly.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoaded(true);
              setFailed(false);
            }}
          >
            Load{" "}
            {post.platform === "instagram" ? "Instagram post" : "TikTok video"}
          </button>
        </>
      )}
      <p>
        <a href={post.original_url} target="_blank" rel="noopener noreferrer">
          View original post ↗
        </a>
      </p>
      <small>
        If the post is deleted, private or restricted, the platform may not
        display it here.
      </small>
      {post.service_id && post.service_name && post.price_pence !== null && (
        <p>
          <Link href={`/p/${post.slug}/services/${post.service_id}`}>
            {post.service_name} · from{" "}
            {new Intl.NumberFormat("en-GB", {
              style: "currency",
              currency: "GBP",
            }).format(post.price_pence / 100)}{" "}
            · View service &amp; book →
          </Link>
        </p>
      )}
      {!post.service_id && (
        <p>
          <Link
            className="button social-book-action"
            href={`/p/${post.slug}#services`}
          >
            View services &amp; book →
          </Link>
        </p>
      )}
      <ContentReportButton
        targetType="professional"
        targetId={post.professional_id}
        label="Report this portfolio or professional"
        context={`Portfolio post: ${post.original_url}\nPlease describe the concern: `}
      />
    </article>
  );
}
function DiscoverPortfolio({ posts }: { posts: PublicSocialPost[] }) {
  const [selected, setSelected] = useState(posts[0].id);
  const post = posts.find((p) => p.id === selected) || posts[0];
  return (
    <div className="social-discover-professional">
      <SocialCard key={post.id} post={post} />
      {posts.length > 1 && (
        <div
          className="social-mini-gallery"
          aria-label={`More work by ${post.business_name}`}
        >
          {posts.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-label={`Preview ${p.platform} work: ${p.caption || "shared post"}`}
              aria-pressed={p.id === post.id}
              onClick={() => setSelected(p.id)}
            >
              <SocialThumbnail post={p} small />
            </button>
          ))}
        </div>
      )}
      <Link className="social-full-portfolio" href={`/p/${post.slug}#our-work`}>
        View {post.business_name}’s complete portfolio →
      </Link>
    </div>
  );
}
export function SocialPortfolio({
  posts,
  compact = false,
}: {
  posts: PublicSocialPost[];
  compact?: boolean;
}) {
  if (!posts.length) return null;
  const groups = new Map<string, PublicSocialPost[]>();
  for (const post of posts) {
    const list = groups.get(post.professional_id) || [];
    if (list.length < 3) list.push(post);
    groups.set(post.professional_id, list);
  }
  return (
    <section id="our-work" className="social-portfolio" aria-label="Our Work">
      <h2>{compact ? "Discover their work" : "Our Work"}</h2>
      <p>
        Shared by participating beauty professionals. Browse their work and view
        services on GLOHAUS.
      </p>
      <div className="social-portfolio-grid">
        {compact
          ? [...groups.entries()]
              .slice(0, 24)
              .map(([id, items]) => (
                <DiscoverPortfolio key={id} posts={items} />
              ))
          : posts.map((p) => <SocialCard key={p.id} post={p} />)}
      </div>
    </section>
  );
}
