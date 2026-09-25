"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLabels } from "./platform-labels";
import { PostActions } from "./post-actions";
import { DiscoverFollowButton } from "./discover-follow-button";
import {
  readDeviceEngagement,
  type EngagementMap,
  type Engagement,
} from "@/modules/engagement/domain";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Bookmark,
  Compass,
  Search,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { BottomNavigation } from "./bottom-navigation";
import type { PublicPost } from "@/modules/posts/domain";
import { categories } from "@/modules/professionals/domain";
import { inspiration } from "@/modules/discovery/inspiration";
const emptyEngagement: EngagementMap = {};
type FollowState = { following: boolean; followerCount: number };
type FollowStateMap = Record<string, FollowState>;
const emptyFollows: FollowStateMap = {};
function subscribeDevice(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("glohaus-preferences", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("glohaus-preferences", callback);
  };
}
function deviceSnapshot() {
  try {
    return localStorage.getItem("glohaus-engagement-v1");
  } catch {
    return null;
  }
}
const serverDeviceSnapshot = () => null;
export function DiscoveryFeed({
  publishedPosts = [],
  initialNext = null,
  initialEngagement = emptyEngagement,
  initialFollows = emptyFollows,
  accountMode = false,
  viewerSignedIn = false,
  canFollow = false,
  savedView = false,
  followingView = false,
  savedPage = 1,
  hasMoreSaved = false,
  hideEditorial = false,
  routeBase = "/",
}: {
  publishedPosts?: PublicPost[];
  initialNext?: string | null;
  initialEngagement?: EngagementMap;
  initialFollows?: FollowStateMap;
  accountMode?: boolean;
  viewerSignedIn?: boolean;
  canFollow?: boolean;
  savedView?: boolean;
  followingView?: boolean;
  savedPage?: number;
  hasMoreSaved?: boolean;
  hideEditorial?: boolean;
  routeBase?: "/" | "/discover";
}) {
  const labels = useLabels();
  const [feedPosts, setFeedPosts] = useState(publishedPosts);
  const [next, setNext] = useState(initialNext);
  const [loadingMore, setLoadingMore] = useState(false);
  const pendingPost = useRef<string | null>(null);
  useEffect(() => {
    if (pendingPost.current)
      document
        .getElementById(`post-${pendingPost.current}`)
        ?.scrollIntoView({ block: "start" });
    pendingPost.current = null;
  }, [feedPosts]);
  async function loadMore() {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ after: next });
      if (category === "Following") params.set("scope", "following");
      const response = await fetch(`/api/v1/posts?${params.toString()}`);
      if (!response.ok) throw new Error();
      const page = await response.json();
      pendingPost.current =
        page.posts.find(
          (post: PublicPost) =>
            category === "For you" ||
            category === "Following" ||
            (category === "Tutorials"
              ? post.kind === "tutorial"
              : post.category === category),
        )?.id || null;
      setFeedPosts((current) => {
        const ids = new Set(current.map((post) => post.id));
        return [
          ...current,
          ...page.posts.filter((post: PublicPost) => !ids.has(post.id)),
        ];
      });
      setNext(page.next);
      // Preserve local in-flight edits to posts already in the feed.
      setAccountEngagement((current) => ({ ...page.engagement, ...current }));
      setFollowMap((current) => ({ ...(page.follows || {}), ...current }));
    } catch {
      setNotice("Could not load more posts. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }
  const [category, setCategory] = useState(
    followingView ? "Following" : savedView ? "Saved" : "For you",
  );
  const router = useRouter();
  const [accountEngagement, setAccountEngagement] = useState(initialEngagement);
  const [followMap, setFollowMap] = useState<FollowStateMap>(initialFollows);
  const deviceRaw = useSyncExternalStore(
    subscribeDevice,
    deviceSnapshot,
    serverDeviceSnapshot,
  );
  const device = readDeviceEngagement(deviceRaw);
  const [devicePage, setDevicePage] = useState(1);
  const [devicePosts, setDevicePosts] = useState<PublicPost[]>([]);
  const engagement = accountMode
    ? {
        ...Object.fromEntries(
          Object.entries(device).filter(([id]) =>
            inspiration.some((p) => p.id === id),
          ),
        ),
        ...accountEngagement,
      }
    : device;
  const saved = Object.keys(engagement).filter((id) => engagement[id].saved);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith("post-"))
      document.getElementById(hash)?.scrollIntoView();
  }, []);
  async function changeEngagement(id: string, value: Engagement) {
    const editorial = inspiration.some((p) => p.id === id);
    if (accountMode && !editorial) {
      const response = await fetch(`/api/v1/posts/${id}/engagement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error("Could not save");
    } else {
      const local = readDeviceEngagement(
        localStorage.getItem("glohaus-engagement-v1"),
      );
      localStorage.setItem(
        "glohaus-engagement-v1",
        JSON.stringify({ ...local, [id]: value }),
      );
      setNotice(
        "Kept on this browser. Community posts sync across devices when you sign in.",
      );
    }
    if (accountMode && !editorial)
      setAccountEngagement((current) => ({ ...current, [id]: value }));
    else window.dispatchEvent(new Event("glohaus-preferences"));
  }
  function requireAuthForEngagement(id: string, value: Engagement) {
    try {
      sessionStorage.setItem(
        "glohaus-pending-engagement-v1",
        JSON.stringify({ id, value }),
      );
    } catch {
      // The return URL still preserves the visitor's position when storage is unavailable.
    }
    router.push(
      `/sign-in?returnTo=${encodeURIComponent(`${routeBase}#post-${id}`)}`,
    );
  }
  const [notice, setNotice] = useState("");
  function changeFollow(professionalId: string, state: FollowState) {
    setFollowMap((current) => ({ ...current, [professionalId]: state }));
    if (category === "Following" && !state.following) {
      setFeedPosts((current) =>
        current.filter((post) => post.professional_id !== professionalId),
      );
    }
  }
  const savedCommunityIds = Object.keys(device).filter(
    (id) => device[id].saved && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id),
  );
  useEffect(() => {
    if (accountMode || category !== "Saved") return;
    const controller = new AbortController();
    const ids = Object.entries(readDeviceEngagement(deviceRaw))
      .filter(
        ([id, value]) => value.saved && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id),
      )
      .map(([id]) => id)
      .slice((devicePage - 1) * 40, devicePage * 40);
    async function load() {
      try {
        if (!ids.length) {
          await Promise.resolve();
          if (!controller.signal.aborted) setDevicePosts([]);
          return;
        }
        const response = await fetch(`/api/v1/posts?ids=${ids.join(",")}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setDevicePosts(data.posts);
      } catch {
        if (!controller.signal.aborted)
          setNotice("Saved community posts are temporarily unavailable.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accountMode, category, devicePage, deviceRaw]);

  const scroll = useRef<HTMLDivElement>(null);
  const community = (
    !accountMode && category === "Saved" ? devicePosts : feedPosts
  ).filter(
    (post) =>
      category === "For you" ||
      category === "Following" ||
      (category === "Saved"
        ? saved.includes(post.id)
        : category === "Tutorials"
          ? post.kind === "tutorial"
          : post.category === category),
  );
  const posts = (hideEditorial || category === "Following" ? [] : inspiration).filter(
    (post) =>
      category === "For you" ||
      (category === "Saved"
        ? saved.includes(post.id)
        : post.category === category),
  );
  function move(direction: number) {
    scroll.current?.scrollBy({
      top: direction * scroll.current.clientHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function filter(nextCategory: string) {
    setDevicePage(1);

    if (nextCategory === "Following") {
      if (!viewerSignedIn) {
        router.push(
          `/sign-in?returnTo=${encodeURIComponent(`${routeBase}?feed=following`)}`,
        );
        return;
      }
      if (!canFollow) {
        setNotice("Following is available to customer accounts.");
        return;
      }
      if (!followingView) router.push(`${routeBase}?feed=following`);
      return;
    }

    if (followingView) {
      if (nextCategory === "Saved" && accountMode)
        router.push(`${routeBase}?view=saved`);
      else router.push(routeBase);
      return;
    }

    if (accountMode && nextCategory === "Saved" && !savedView) {
      router.push(`${routeBase}?view=saved`);
      return;
    }
    if (savedView && nextCategory !== "Saved") {
      router.push(routeBase);
      return;
    }
    setCategory(nextCategory);
    scroll.current?.scrollTo({ top: 0 });
  }
  return (
    <div className="discover-app">
      <aside className="discovery-sidebar">
        <Brand />
        <p className="discovery-tagline">Look good. Feel good. Belong.</p>
        <nav aria-label="Main navigation">
          <button
            className={
              category !== "Saved" ? "discovery-nav selected" : "discovery-nav"
            }
            onClick={() => filter("For you")}
          >
            <Compass size={22} />
            Discover
          </button>
          <Link className="discovery-nav" href="/explore">
            <Search size={22} />
            Find a {labels.Professional.toLowerCase()}
          </Link>
          <button
            className={
              category === "Saved" ? "discovery-nav selected" : "discovery-nav"
            }
            onClick={() => filter("Saved")}
          >
            <Bookmark size={22} />
            Saved
          </button>
          <Link className="discovery-nav" href="/workspace">
            <UserRound size={22} />
            Your space
          </Link>
        </nav>
        <div className="creator-invite">
          <span className="creator-star">✳</span>
          <h2>Your work belongs here.</h2>
          <p>
            Independent beauty.
            <br />A whole new audience.
          </p>
          <Link href="/sign-up?intent=professional">
            Join as a {labels.Professional.toLowerCase()}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="discovery-sidebar-foot">
          <span>ENGLAND · GBP £</span>
          <Link href="/sign-in">Sign in</Link>
        </div>
      </aside>
      <main id="main" className="discovery-main">
        <header className="discovery-top">
          <div className="discovery-mobile-brand">
            <Brand />
          </div>
          <div className="discovery-heading">
            <p className="eyebrow">DISCOVER. BOOK. GET INSPIRED.</p>
            <h1>
              Real beauty. Real people. <em>Real results.</em>
            </h1>
            <p className="discovery-trust">
              Browse freely. Book when you’re ready.
            </p>
          </div>
          <div className="discovery-top-actions">
            <Link className="discovery-search-bar" href="/explore">
              <Search size={17} aria-hidden />
              <span>Search services, professionals...</span>
            </Link>
            <Link
              className="discovery-notifications"
              href="/notifications"
              aria-label="Your notifications"
            >
              <Bell size={19} aria-hidden />
            </Link>
            <Link className="button small discovery-join" href="/sign-up">
              Join GLOHAUS
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </header>
        <div className="discovery-tabs" aria-label="Filter inspiration">
          {["Following", "For you", ...categories, "Tutorials"].map((item) => (
            <button
              key={item}
              aria-pressed={category === item}
              className={category === item ? "active" : ""}
              onClick={() => filter(item)}
            >
              {item === "For you" && <Sparkles size={15} />}{" "}
              {labels[item as keyof typeof labels] || item}
            </button>
          ))}
        </div>
        <div className="feed-layout">
          <div
            className="feed-scroll"
            ref={scroll}
            tabIndex={0}
            aria-label="Beauty inspiration feed. Scroll to see the next post."
          >
            {posts.length === 0 && community.length === 0 ? (
              <div className="feed-empty">
                <Sparkles size={36} />
                <h2>
                  {category === "Following"
                    ? viewerSignedIn
                      ? "Your Following feed is ready to grow."
                      : "Sign in to see your Following feed."
                    : category === "Saved"
                      ? "Make room for your favourites."
                      : "A fresh space for new ideas."}
                </h2>
                <p>
                  {category === "Following"
                    ? viewerSignedIn
                      ? "Follow professionals you want to keep up with and their new work will appear here."
                      : "Following is personal to your GLOHAUS customer account."
                    : category === "Saved"
                      ? "Tap the bookmark on a post to keep it here for another day."
                      : `Our ${category.toLowerCase()} collection is still growing. Explore another category in the meantime.`}
                </p>
                <button
                  className="button"
                  onClick={() =>
                    category === "Following" && !viewerSignedIn
                      ? filter("Following")
                      : filter("For you")
                  }
                >
                  {category === "Following" && !viewerSignedIn
                    ? "Sign in"
                    : "Explore inspiration"}
                </button>
              </div>
            ) : (
              <>
                {community.map((post) => (
                  <article
                    className="feed-slide community-slide"
                    key={post.id}
                    id={`post-${post.id}`}
                    aria-label={post.title}
                  >
                    {post.asset_id && (
                      <>
                        {}
                        <Image
                          width={1600}
                          height={2000}
                          unoptimized
                          className="feed-image"
                          src={`/api/media/${post.asset_id}`}
                          alt={post.title}
                          loading="lazy"
                        />
                        <div className="feed-shade" />
                      </>
                    )}
                    <div className="feed-overline">
                      <span>
                        {labels[post.category as keyof typeof labels] ||
                          post.category}
                      </span>
                      <span>
                        {post.kind === "tutorial"
                          ? "WRITTEN TUTORIAL"
                          : "DESIGN STORY"}
                      </span>
                    </div>
                    <span className="community-glyph" aria-hidden>
                      g.
                    </span>
                    <div className="feed-caption">
                      <Link
                        className="editorial-author"
                        href={`/p/${post.slug}`}
                      >
                        <span>{post.business_name.slice(0, 1)}</span>
                        {post.business_name}
                        <small>{post.city}</small>
                      </Link>
                      <DiscoverFollowButton
                        professionalId={post.professional_id}
                        state={
                          followMap[post.professional_id] || {
                            following: false,
                            followerCount: 0,
                          }
                        }
                        signedIn={viewerSignedIn}
                        canFollow={canFollow}
                        returnTo={`${routeBase}#post-${post.id}`}
                        onChange={changeFollow}
                      />
                      <h2>{post.title}</h2>
                      <details className="post-reader">
                        <summary>
                          {post.kind === "tutorial"
                            ? "Read tutorial"
                            : "Read story"}
                        </summary>
                        <p>{post.body}</p>
                      </details>
                      <Link className="feed-cta" href={`/p/${post.slug}`}>
                        {post.service_name
                          ? `Explore ${post.service_name}`
                          : `Meet the ${labels.Professional.toLowerCase()}`}
                        <ArrowUpRight size={18} />
                      </Link>
                    </div>
                    <PostActions
                      id={post.id}
                      title={post.title}
                      value={
                        engagement[post.id] || { liked: false, saved: false }
                      }
                      onChange={changeEngagement}
                      onNotice={setNotice}
                      requireAuth={
                        accountMode ? undefined : requireAuthForEngagement
                      }
                      editorialBase={routeBase}
                    />
                  </article>
                ))}
                {posts.map((post, index) => (
                  <article
                    className="feed-slide"
                    key={post.id}
                    id={`post-${post.id}`}
                    aria-label={post.title}
                  >
                    {}
                    <Image
                      width={1600}
                      height={2000}
                      unoptimized
                      className="feed-image"
                      src={post.image}
                      alt={post.alt}
                      loading={index === 0 ? "eager" : "lazy"}
                      referrerPolicy="no-referrer"
                    />
                    <div className="feed-shade" />
                    <div className="feed-overline">
                      <span>
                        {labels[post.category as keyof typeof labels] ||
                          post.category}
                      </span>
                      <span>THE GLOHAUS EDIT</span>
                    </div>
                    <div className="feed-caption">
                      <span className="editorial-author">
                        <span>g.</span>GLOHAUS inspiration{" "}
                        <small>Editorial collection</small>
                      </span>
                      <h2>{post.title}</h2>
                      <p>{post.caption}</p>
                      <Link
                        href={`/explore?q=${encodeURIComponent(post.category)}`}
                        className="feed-cta"
                      >
                        Find{" "}
                        {(
                          labels[post.category as keyof typeof labels] ||
                          post.category
                        ).toLowerCase()}{" "}
                        {labels.Professionals.toLowerCase()}
                        <ArrowUpRight size={18} />
                      </Link>
                      <a
                        className="photo-credit"
                        href={post.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Photo: {post.photographer} / Unsplash
                      </a>
                    </div>
                    <PostActions
                      id={post.id}
                      title={post.title}
                      editorial
                      value={
                        engagement[post.id] || { liked: false, saved: false }
                      }
                      onChange={changeEngagement}
                      onNotice={setNotice}
                      requireAuth={
                        accountMode ? undefined : requireAuthForEngagement
                      }
                      editorialBase={routeBase}
                    />

                    <span className="feed-page">
                      {String(index + 1).padStart(2, "0")} /{" "}
                      {String(posts.length).padStart(2, "0")}
                    </span>
                  </article>
                ))}
              </>
            )}
            {next && category !== "Saved" && (
              <div className="feed-more">
                <button
                  className="button"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? "Loading inspiration…" : "More inspiration"}
                </button>
                <p>Discover more work from the community.</p>
              </div>
            )}
          </div>
          <div className="feed-rail">
            <div className="feed-context">
              <span className="eyebrow">STAY CURIOUS</span>
              <h2>
                Beauty is
                <br />
                <em>personal.</em>
              </h2>
              <p>
                Find a look you love.
                <br />
                Discover the people behind it.
                <br />
                Book when you’re ready.
              </p>
              <span className="browse-promise">
                No booking needed to browse.
              </span>
            </div>
            <div className="next-chapter">
              <ShoppingBag size={21} />
              <h3>
                From the look
                <br />
                to the little essentials.
              </h3>
              <p>
                Products linked to services are part of the next chapter of
                GLOHAUS.
              </p>
            </div>
            <div className="feed-controls">
              <button onClick={() => move(-1)} aria-label="Previous post">
                <ArrowUp size={20} />
              </button>
              <button onClick={() => move(1)} aria-label="Next post">
                <ArrowDown size={20} />
              </button>
              <span>SCROLL TO DISCOVER</span>
            </div>
          </div>
        </div>
        {category === "Saved" &&
          !accountMode &&
          savedCommunityIds.length > 40 && (
            <nav className="editor-actions" aria-label="Saved posts pages">
              {devicePage > 1 && (
                <button onClick={() => setDevicePage((page) => page - 1)}>
                  Previous saved posts
                </button>
              )}
              {devicePage * 40 < savedCommunityIds.length && (
                <button onClick={() => setDevicePage((page) => page + 1)}>
                  More saved posts →
                </button>
              )}
            </nav>
          )}
        {savedView && accountMode && (
          <nav className="editor-actions" aria-label="Saved posts pages">
            {savedPage > 1 && (
              <Link href={`${routeBase}?view=saved&page=${savedPage - 1}`}>
                Previous saved posts
              </Link>
            )}
            {hasMoreSaved && (
              <Link href={`${routeBase}?view=saved&page=${savedPage + 1}`}>
                More saved posts →
              </Link>
            )}
          </nav>
        )}
        {notice && (
          <div className="feed-toast" role="status">
            {notice}
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}
