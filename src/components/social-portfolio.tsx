"use client";
import { useState } from "react";
import Link from "next/link";
import type { PublicSocialPost } from "@/modules/business-tools/domain";
import { socialPostLink } from "@/modules/business-tools/domain";
import { ContentReportButton } from "./content-report-button";
import "./business-tools.css";
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
      <p>
        <strong>
          {post.platform === "instagram" ? "Instagram" : "TikTok"}
        </strong>{" "}
        · <Link href={`/p/${post.slug}`}>{post.business_name}</Link>
      </p>
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
      <ContentReportButton
        targetType="professional"
        targetId={post.professional_id}
        label="Report this portfolio or professional"
      />
    </article>
  );
}
export function SocialPortfolio({ posts }: { posts: PublicSocialPost[] }) {
  if (!posts.length) return null;
  return (
    <section className="social-portfolio" aria-label="Social portfolio">
      <h2>Work from their social portfolios</h2>
      <p>
        Shared by participating beauty professionals. Browse their work and view
        services on GLOHAUS.
      </p>
      <div className="social-portfolio-grid">
        {posts.map((p) => (
          <SocialCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}
