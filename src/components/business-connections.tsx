"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ConnectionStatus,
  Provider,
  SocialPost,
} from "@/modules/business-tools/domain";
import "./business-tools.css";
import { SocialPostPreview } from "./social-post-preview";
const names = {
  google: "Google Calendar",
  outlook: "Microsoft Outlook",
  ics: "iCal / ICS",
  instagram: "Instagram",
  tiktok: "TikTok",
};
export function BusinessConnections({
  connections,
  posts,
  preferences,
  ready,
  services,
  callback,
  portfolio = {
    max_visible_posts: 12,
    instagram_url: "",
    tiktok_url: "",
    sync_allowed: true,
  },
}: {
  connections: ConnectionStatus[];
  posts: SocialPost[];
  preferences: { buffer_minutes: number; travel_buffer_minutes: number };
  ready: Record<Provider, boolean>;
  services: { id: string; name: string }[];
  callback?: string;
  portfolio?: {
    max_visible_posts: number;
    instagram_url: string;
    tiktok_url: string;
    sync_allowed: boolean;
    public_profile_ready?: boolean;
  };
}) {
  const inFlight = useRef(false);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(
      callback === "connected"
        ? "Account connected. Check the sync status below."
        : callback
          ? "The connection could not finish synchronising. Reconnect or try syncing again."
          : "",
    );
  async function action(body: unknown, path = "connections", method = "POST") {
    if (inFlight.current || refreshing) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/professional/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(70000),
      });
      const data = await response.json().catch(() => null);
      if (!data)
        throw Error(
          "The server returned an unexpected response. Refresh this page and check the result before trying again.",
        );
      if (!response.ok)
        throw Error(
          data.error?.code === "NOT_CONFIGURED"
            ? "This provider needs setup before you can connect."
            : data.error?.code === "SOCIAL_SYNC_PAUSED"
              ? "Portfolio syncing is paused by GLOHAUS. Your bookings and profile remain available."
              : response.status === 401
                ? "Your session has expired. Sign in to GLOHAUS again."
                : response.status === 403
                  ? "This account cannot manage that connection or post. Check that you are signed in to the correct professional profile."
                  : data.error?.code === "INVALID_REQUEST"
                    ? "Check the post link and form values, then try again."
                    : "This change could not be completed. Your existing settings are preserved. Please try again.",
        );
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setNotice(
        data.revocation === "not_confirmed"
          ? "Disconnected from GLOHAUS and imported videos hidden. TikTok access removal could not be confirmed. Remove GLOHAUS from your connected apps in TikTok settings."
          : data.failed
            ? "Sync needs attention. Your connection is not up to date. Check the status below."
            : typeof data.synced === "number"
              ? data.synced > 0
                ? "Refresh complete. Eligible public videos are listed below. Choose Published and Save post to display a draft on your profile. TikTok drafts are not imported."
                : "No refresh ran. Another sync may already be running. Wait a moment, then refresh this page to check its status."
              : method === "DELETE"
                ? "Removed from public display. Imported posts remain here as Hidden so later syncs preserve your choice; manually added links are removed."
                : data.duplicate
                  ? "That post is already in your portfolio."
                  : "Saved. Your changes are up to date.",
      );
      startRefresh(() => router.refresh());
    } catch (error) {
      setNotice(
        typeof error === "object" &&
          error !== null &&
          "name" in error &&
          ["TimeoutError", "AbortError"].includes(String(error.name))
          ? "This request took too long. Refresh this page to check whether it completed before retrying."
          : error instanceof TypeError
            ? "Could not reach GLOHAUS. Check your connection, then try again."
            : error instanceof Error
              ? error.message
              : "Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const serviceSelect = (value: string | null, name = "serviceId") => (
    <label>
      Link to a service
      <select name={name} defaultValue={value || ""}>
        <option value="">Professional profile only</option>
        {services.map((s) => (
          <option value={s.id} key={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="business-tools">
      {(notice || busy || refreshing) && (
        <div
          className="business-feedback"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>
            {busy
              ? "Updating your connection or portfolio…"
              : refreshing
                ? "Updating the displayed results…"
                : notice}
          </p>
          {!busy && !refreshing && (
            <button
              type="button"
              aria-label="Dismiss connection message"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          )}
        </div>
      )}
      <section id="calendar" className="pro-editor-surface">
        <h2>Calendar &amp; availability</h2>
        <p>
          Connect your calendar to share busy times while keeping your existing booking tools.
        </p>
        <p>
          We read your primary Google or default Outlook calendar. Customers cannot see private titles or client details; make sure your other bookings appear on that calendar.
        </p>
        {(["google", "outlook"] as const).map((provider) => (
          <form
            key={provider}
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void action({
                action: "connect",
                provider,
                consent: true,
                writeCalendar: f.get("export") === "on",
              });
            }}
          >
            <h3>{names[provider]}</h3>
            <label className="business-check">
              <input
                type="checkbox"
                name="export"
                disabled={!ready[provider]}
              />
              Also add GLOHAUS appointments to this calendar
            </label>
            <small>
              Optional: add private appointment events without client names. Cancel or reschedule GLOHAUS bookings here.
            </small>
            <label className="business-check">
              <input type="checkbox" required disabled={!ready[provider]} />I
              agree to connect this calendar and share busy times with GLOHAUS.
            </label>
            <button className="button" disabled={busy || !ready[provider]}>
              {ready[provider]
                ? `Connect ${names[provider]}`
                : "Provider setup required"}
            </button>
          </form>
        ))}
        <details>
          <summary>Subscribe using an iCal / ICS link</summary>
          <p>
            Read-only, supported HTTPS feeds only. The link is stored encrypted.
            Floating and all-day times use the UK clock; named timezones must be
            included in the feed. Unsupported feeds show an error. Subscription
            changes can take time to reach GLOHAUS.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              void action({
                action: "connect",
                provider: "ics",
                url: f.get("url"),
                label: f.get("label"),
                consent: true,
              });
            }}
          >
            <label>
              Calendar name
              <input
                name="label"
                required
                maxLength={100}
                placeholder="Existing appointments"
              />
            </label>
            <label>
              Private subscription link
              <input
                name="url"
                type="url"
                required
                maxLength={2048}
                placeholder="https://…"
                autoComplete="off"
              />
            </label>
            <label className="business-check">
              <input type="checkbox" required />I have permission to connect
              this calendar.
            </label>
            <button className="button" disabled={busy || !ready.ics}>
              {ready.ics ? "Connect calendar" : "Calendar setup required"}
            </button>
          </form>
        </details>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            void action({
              action: "preferences",
              bufferMinutes: Number(f.get("buffer")),
              travelBufferMinutes: Number(f.get("travel")),
            });
          }}
        >
          <h3>Give yourself breathing room</h3>
          <p>
            Buffers add time before and after busy appointments, breaks and calendar events. Travel time adds an extra buffer; existing bookings stay unchanged.
          </p>
          <label>
            Appointment buffer
            <select
              name="buffer"
              aria-label="Appointment buffer"
              defaultValue={preferences.buffer_minutes}
            >
              {[0, 15, 30].map((n) => (
                <option value={n} key={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            Extra travel buffer
            <select
              name="travel"
              aria-label="Extra travel buffer"
              defaultValue={preferences.travel_buffer_minutes}
            >
              {[0, 15, 30].map((n) => (
                <option value={n} key={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
          <button className="button" disabled={busy || refreshing}>
            Save buffers
          </button>
          <Link href="/professional/availability">
            Edit working hours, breaks and time off →
          </Link>
        </form>
        <p>
          Calendar updates can be delayed, so clashes are still possible. New slots may pause if a calendar is out of date or has an error, until it syncs or you disconnect it.
        </p>
      </section>
      <section id="social" className="pro-editor-surface">
        <h2>Social Media &amp; Portfolio</h2>
        {portfolio.public_profile_ready === false && (
          <p role="note">
            Your public professional profile is not ready yet. Videos can be
            imported and prepared privately, but visitors cannot see them until
            you{" "}
            <Link href="/professional/profile">
              complete and publish your professional profile
            </Link>
            .
          </p>
        )}
        <p>
          Show work you already share on Instagram and TikTok. You choose what
          appears on your profile and in Discover.
        </p>
        <p>
          Connecting social accounts is optional and never required for bookings. GLOHAUS does not post to your social accounts.
        </p>
        <details>
          <summary>How connected-account information is used</summary>
          <p>
            With your permission, we store encrypted account credentials on our
            servers to fetch eligible posts. Imported captions, source links and
            supported previews are stored for your portfolio. Approval Mode
            keeps new work private until you publish it.
          </p>
          <p>
            Disconnecting stops imports, removes the stored credentials and
            hides imported posts on GLOHAUS. You can also revoke access in the
            provider’s settings. Removing work here does not delete the original
            social post. Read our <a href="/privacy">Privacy Policy</a> for
            information about your data and rights.
          </p>
        </details>
        {!portfolio.sync_allowed && (
          <p role="status">
            Portfolio syncing is paused by GLOHAUS. Your profile, existing work
            and bookings remain available.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(
              {
                action: "portfolioPreferences",
                maxVisiblePosts: Number(f.get("maxVisiblePosts")),
                instagramUrl: f.get("instagramUrl") || "",
                tiktokUrl: f.get("tiktokUrl") || "",
              },
              "social",
              "PUT",
            );
          }}
        >
          <h3>Profile links &amp; display limit</h3>
          <p>
            These optional links work immediately, without account
            authorisation. They do not import posts.
          </p>
          <label>
            Instagram profile link
            <input
              name="instagramUrl"
              type="url"
              maxLength={500}
              defaultValue={portfolio.instagram_url}
              placeholder="https://www.instagram.com/yourstudio/"
            />
          </label>
          <label>
            TikTok profile link
            <input
              name="tiktokUrl"
              type="url"
              maxLength={500}
              defaultValue={portfolio.tiktok_url}
              placeholder="https://www.tiktok.com/@yourstudio"
            />
          </label>
          <label>
            Maximum visible social posts
            <input
              name="maxVisiblePosts"
              type="number"
              min={1}
              max={40}
              required
              defaultValue={portfolio.max_visible_posts}
            />
          </label>
          <button className="button" disabled={busy || refreshing}>
            Save portfolio settings
          </button>
        </form>
        {(["instagram", "tiktok"] as const).map((provider) => (
          <form
            key={provider}
            onSubmit={(event) => {
              event.preventDefault();
              void action({ action: "connect", provider, consent: true });
            }}
          >
            <h3>{names[provider]}</h3>
            <p>
              {provider === "instagram"
                ? "Official Instagram connection supports eligible Business and Creator accounts. Personal accounts must use manual links or switch to an eligible account with Instagram."
                : "Connect an eligible TikTok account to import public videos."}{" "}
              Automatic access depends on platform approval and permissions.
            </p>
            <label className="business-check">
              <input type="checkbox" required disabled={!ready[provider]} />I
              authorise GLOHAUS to read eligible posts and prepare them for my
              portfolio.
            </label>
            <button className="button" disabled={busy || !ready[provider]}>
              {ready[provider]
                ? `Connect ${names[provider]}`
                : "Provider setup required — use post links below"}
            </button>
          </form>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            void action(
              {
                url: f.get("url"),
                caption: f.get("caption"),
                serviceId: f.get("serviceId") || null,
                consent: true,
              },
              "social",
            );
          }}
        >
          <h3>Add a post link</h3>
          <p>
            Paste a full Instagram post/Reel or TikTok video link. It starts as a private draft; we do not scrape or copy its media, or invent a creation date.
          </p>
          <label>
            Post URL
            <input name="url" type="url" required maxLength={500} />
          </label>
          <label>
            Describe your work
            <textarea name="caption" maxLength={1800} />
          </label>
          {serviceSelect(null)}
          <label className="business-check">
            <input type="checkbox" required />
            This is my work, I have the necessary permissions, and I consent to
            displaying it on GLOHAUS.
          </label>
          <button className="button" disabled={busy || refreshing}>
            Add post link
          </button>
        </form>
      </section>
      <section className="pro-editor-surface">
        <h2>Your connections</h2>
        {!connections.length && <p>No external accounts connected yet.</p>}
        {connections.map((c) => (
          <article
            key={`${c.id}:${c.social_mode}:${c.sync_enabled}`}
            className="business-connection"
          >
            <h3>{c.label}</h3>
            <p>
              <strong>
                {c.status === "connected"
                  ? "Connected"
                  : c.status === "disconnected"
                    ? "Disconnected — not synchronising"
                    : c.status === "error"
                      ? "Sync needs attention"
                      : "Waiting for first sync"}
              </strong>
            </p>
            <p>
              Last successful sync:{" "}
              {c.last_success_at
                ? new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Europe/London",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(c.last_success_at))
                : "Not yet synchronised"}
            </p>
            {c.last_error && (
              <p role="alert">
                {c.last_error === "RECONNECT_REQUIRED"
                  ? "Permissions have expired, are missing or have been removed. Reconnect this provider in Social Media & Portfolio above."
                  : c.last_error === "FEED_UNSUPPORTED"
                    ? "This calendar format or timezone is not supported. Use manual time off while you check the feed."
                    : "We could not finish the last sync. Try again or reconnect."}
              </p>
            )}
            {c.status !== "disconnected" && (
              <>
                {(["instagram", "tiktok"] as string[]).includes(c.provider) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action({
                        action: "socialSettings",
                        id: c.id,
                        mode: f.get("mode"),
                        syncEnabled: f.get("syncEnabled") === "on",
                      });
                    }}
                  >
                    <label>
                      Display mode for {c.label}
                      <select
                        name="mode"
                        defaultValue={
                          c.social_mode ||
                          (c.auto_publish ? "automatic" : "approval")
                        }
                      >
                        <option value="approval">
                          Approval Mode — import as drafts
                        </option>
                        <option value="automatic">
                          Automatic Mode — publish new eligible work
                        </option>
                        <option value="manual">
                          Manual Mode — refresh or add links yourself
                        </option>
                      </select>
                    </label>
                    <label className="business-check">
                      <input
                        name="syncEnabled"
                        type="checkbox"
                        defaultChecked={c.sync_enabled !== false}
                      />
                      Enable periodic portfolio syncing
                    </label>
                    <small>
                      Approval Mode is the default. Manual Mode does not fetch
                      in the background. Scheduled checks are normally hourly,
                      subject to provider limits and retries. Existing hidden
                      posts stay hidden. Imports cover up to the latest 1,000
                      Instagram posts or 200 TikTok videos. Imported work
                      outside that recent window stops appearing publicly;
                      original posts are not deleted.
                    </small>
                    <button className="button" disabled={busy || refreshing}>
                      Save connection settings
                    </button>
                  </form>
                )}
                <div className="business-actions">
                  <button
                    className="button"
                    disabled={
                      busy ||
                      refreshing ||
                      (["instagram", "tiktok"].includes(c.provider) &&
                        (!portfolio.sync_allowed || !ready[c.provider]))
                    }
                    onClick={() => void action({ action: "sync", id: c.id })}
                  >
                    {busy ? "Working…" : "Refresh public videos / sync now"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy || refreshing}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Disconnect this account? External calendar blocks will be removed and imported social posts hidden. Existing GLOHAUS bookings remain in place. You can also revoke access in the provider’s settings.",
                        )
                      )
                        void action({ action: "disconnect", id: c.id });
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>
      <section id="posts" className="pro-editor-surface">
        <h2>Portfolio &amp; social posts</h2>
        <p>
          Publish a post to show it publicly; lower display numbers appear first. Link a service to show its current starting price and booking options.
        </p>
        {!posts.length && (
          <p>
            Add a link or connect an account to prepare your first social post.
          </p>
        )}
        {posts.map((p) => (
          <form
            className="business-connection"
            key={`${p.id}:${p.publication_status}:${p.service_id}:${p.sort_order}:${p.featured}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(
                {
                  id: p.id,
                  publicationStatus: f.get("status"),
                  serviceId: f.get("serviceId") || null,
                  sortOrder: Number(f.get("sort")),
                  featured: f.get("featured") === "on",
                },
                "social",
                "PUT",
              );
            }}
          >
            <SocialPostPreview post={p} />
            <a href={p.original_url} target="_blank" rel="noopener noreferrer">
              View original on{" "}
              {p.platform === "instagram" ? "Instagram" : "TikTok"} ↗
            </a>
            <p>{p.caption}</p>
            <small>
              {p.source_created_at
                ? `Originally created ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium" }).format(new Date(p.source_created_at))}`
                : "Creation date not supplied — manually added link"}
            </small>
            {p.publication_status === "unavailable" ||
            p.source_available === false ? (
              <p>
                This post was not returned in the connected account’s recent
                import window. It may be older, deleted or restricted.
              </p>
            ) : (
              <>
                <label>
                  Display
                  <select name="status" defaultValue={p.publication_status}>
                    <option value="draft">Draft — only you</option>
                    <option value="published">Published — public</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </label>
                {serviceSelect(p.service_id)}
                <label className="business-check">
                  <input
                    name="featured"
                    type="checkbox"
                    defaultChecked={p.featured === true}
                  />
                  Pin as featured work
                </label>
                <label>
                  Display order
                  <input
                    name="sort"
                    type="number"
                    min={0}
                    max={10000}
                    required
                    defaultValue={p.sort_order}
                  />
                </label>
                <button className="button" disabled={busy || refreshing}>
                  {busy ? "Saving…" : "Save post"}
                </button>
              </>
            )}
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || refreshing}
              onClick={() => void action({ id: p.id }, "social", "DELETE")}
            >
              Remove from display
            </button>
          </form>
        ))}
      </section>
    </div>
  );
}

