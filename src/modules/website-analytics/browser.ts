import {
  ActiveClock,
  actions,
  analyticsPage,
  scrollPercent,
  type Snapshot,
} from "./domain";
let permitted = false;
const pendingKey = "glohaus-engagement-pending-v1";
const visitorKey = "glohaus-engagement-visitor-v1",
  sessionKey = "glohaus-engagement-session-v1";
export function clearAnalyticsIdentity() {
  permitted = false;
  try {
    sessionStorage.removeItem(pendingKey);
    localStorage.removeItem(visitorKey);
    sessionStorage.removeItem(sessionKey);
  } catch {}
}
function identity(key: string, store: Storage, lifetime: number) {
  const now = Date.now();
  try {
    const old = JSON.parse(store.getItem(key) ?? "null");
    if (
      old &&
      typeof old.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(old.id) &&
      old.expires > now
    )
      return old.id as string;
  } catch {}
  const id = crypto.randomUUID();
  store.setItem(key, JSON.stringify({ id, expires: now + lifetime }));
  return id;
}
export function startEngagement(path: string): () => void {
  permitted = true;
  verifyPendingConversion(path);
  const page = analyticsPage(path);
  if (!page) return () => {};
  let visitor: string, session: string;
  try {
    visitor = identity(visitorKey, localStorage, 30 * 86400000);
    session = identity(sessionKey, sessionStorage, 30 * 60000);
  } catch {
    return () => {};
  }
  const clock = new ActiveClock(performance.now());
  const row: Snapshot = {
    id: crypto.randomUUID(),
    visitor,
    session,
    page,
    device: matchMedia("(max-width: 600px)").matches
      ? "mobile"
      : matchMedia("(max-width: 1024px)").matches
        ? "tablet"
        : "desktop",
    sequence: 0,
    activeMs: 0,
    scroll: 0,
    clicks: {},
    videos: [],
  };
  let lastInteraction = Date.now();
  let successor: (() => void) | undefined;
  let disposed = false,
    stopped = false,
    lastSend = 0;
  function tick() {
    row.activeMs = clock.tick(
      performance.now(),
      !document.hidden,
      document.hasFocus(),
    );
  }
  function touch() {
    tick();
    if (document.hidden || !document.hasFocus()) return;
    if (Date.now() - lastInteraction > 30 * 60000) {
      cleanup();
      successor = startEngagement(path);
      return;
    }
    lastInteraction = Date.now();
    clock.touch(performance.now());
    try {
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({ id: session, expires: lastInteraction + 30 * 60000 }),
      );
    } catch {}
  }
  function send() {
    if (stopped || !permitted) return;
    tick();
    if (Date.now() - lastInteraction < 30 * 60000) {
      try {
        sessionStorage.setItem(
          sessionKey,
          JSON.stringify({ id: session, expires: lastInteraction + 30 * 60000 }),
        );
      } catch {}
    }
    row.sequence++;
    lastSend = performance.now();
    void fetch("/api/v1/engagement/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
      credentials: "same-origin",
      keepalive: true,
    })
      .then((r) => {
        if (r.status === 403 || r.status === 503 || r.status === 429)
          stopped = true;
      })
      .catch(() => {
        stopped = true;
      });
  }
  function scroll(event: Event) {
    touch();
    if (disposed) return;
    const el =
      event.target instanceof HTMLElement
        ? event.target
        : document.scrollingElement;
    const d =
      el === document.documentElement || el === document.body
        ? document.scrollingElement
        : el;
    if (
      d &&
      (d === document.scrollingElement ||
        (d instanceof Element && d.matches(".feed-scroll")))
    )
      row.scroll = Math.max(
        row.scroll,
        scrollPercent(d.scrollTop, d.scrollHeight, d.clientHeight),
      );
  }
  function click(event: Event) {
    touch();
    if (disposed) return;
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest("[data-analytics-action],a[href]");
    if (!target) return;
    let action = target.getAttribute("data-analytics-action");
    if (!action && target instanceof HTMLAnchorElement) {
      const url = new URL(target.href);
      if (url.origin === location.origin) action = analyticsPage(url.pathname);
    }
    if (actions.includes(action as (typeof actions)[number])) {
      if (
        action === "checkout" &&
        (page === "service" || page === "checkout")
      ) {
        try {
          sessionStorage.setItem(
            pendingKey,
            JSON.stringify({
              visit: row.id,
              kind: page === "service" ? "booking" : "purchase",
              expires: Date.now() + 3600000,
            }),
          );
        } catch {}
      }
      const key = action as (typeof actions)[number];
      row.clicks[key] = Math.min(1000, (row.clicks[key] ?? 0) + 1);
    }
  }
  function visibility() {
    tick();
    if (document.hidden) send();
    else clock.touch(performance.now());
  }
  // Only first-party Discover video assets are instrumented. No titles or URLs leave the browser.
  const registered = new Map<HTMLVideoElement, () => void>();
  function register(video: HTMLVideoElement) {
    if (registered.has(video) || page !== "discover") return;
    const id = video
      .getAttribute("src")
      ?.match(/^\/api\/media\/([0-9a-f-]{36})$/i)?.[1];
    if (!id || row.videos.length >= 100) return;
    let metrics = row.videos.find((v) => v.id === id);
    if (!metrics) {
      metrics = {
        id,
        impressions: 0,
        watchMs: 0,
        starts: 0,
        completions: 0,
        replays: 0,
      };
      row.videos.push(metrics);
    }
    const v = metrics;
    let ratio = 0,
      lastWall = performance.now(),
      lastMedia = video.currentTime,
      watched = 0,
      completed = false,
      started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        if (ratio >= 0.5 && !document.hidden) v.impressions = 1;
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(video);
    function update() {
      const now = performance.now(),
        media = video.currentTime,
        delta = media - lastMedia,
        wall = now - lastWall;
      const watching =
        ratio >= 0.5 &&
        !document.hidden &&
        document.hasFocus() &&
        !video.paused &&
        !video.seeking &&
        video.readyState >= 2;
      if (watching) {
        v.impressions = 1;
        if (!started) {
          v.starts++;
          started = true;
        }
        const valid =
          delta > 0 &&
          delta <= (wall / 1000) * video.playbackRate + 0.25 &&
          wall <= 2500;
        if (valid) {
          const ms = Math.min(delta * 1000, wall, 2000);
          v.watchMs += Math.round(ms);
          watched += delta * 1000;
          clock.touch(now);
          lastInteraction = Date.now();
        }
        if (
          !completed &&
          Number.isFinite(video.duration) &&
          video.duration > 0 &&
          watched >= video.duration * 950
        ) {
          v.completions++;
          completed = true;
        }
        if (delta < -0.5 && media < 1 && lastMedia >= video.duration - 1.5) {
          if (completed) {
            v.replays++;
            v.starts++;
          }
          watched = 0;
          completed = false;
        }
      }
      lastWall = now;
      lastMedia = media;
    }
    video.addEventListener("timeupdate", update);
    video.addEventListener("seeking", update);
    registered.set(video, () => {
      observer.disconnect();
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("seeking", update);
    });
  }
  function scan() {
    document
      .querySelectorAll<HTMLVideoElement>(".viewport-video--feed video")
      .forEach(register);
    for (const [v, clean] of registered)
      if (!v.isConnected) {
        clean();
        registered.delete(v);
      }
  }
  const mutation = new MutationObserver(scan);
  if (page === "discover") {
    scan();
    mutation.observe(document.body, { childList: true, subtree: true });
  }
  const interval = setInterval(() => {
    tick();
    if (!document.hidden && performance.now() - lastSend >= 15000) send();
  }, 1000);
  const interactions = ["pointerdown", "keydown", "touchstart"] as const;
  interactions.forEach((e) =>
    document.addEventListener(e, touch, { passive: true }),
  );
  document.addEventListener("click", click, true);
  document.addEventListener("scroll", scroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", send);
  row.scroll = scrollPercent(
    document.scrollingElement?.scrollTop ?? 0,
    document.scrollingElement?.scrollHeight ?? innerHeight,
    innerHeight,
  );
  send();
  function cleanup() {
    if (disposed) {
      successor?.();
      return;
    }
    disposed = true;
    send();
    clearInterval(interval);
    mutation.disconnect();
    registered.forEach((clean) => clean());
    interactions.forEach((e) => document.removeEventListener(e, touch));
    document.removeEventListener("click", click, true);
    document.removeEventListener("scroll", scroll, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", send);
  }
  return cleanup;
}

function verifyPendingConversion(path: string) {
  if (!(
    /^\/account\/bookings\/[^/]+$/.test(path) || path === "/account/orders"
  ))
    return;
  let pending: { visit: string; kind: string; expires: number };
  try {
    pending = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
  } catch {
    return;
  }
  if (!pending || pending.expires < Date.now()) return;
  if (pending.kind === "booking" && !path.startsWith("/account/bookings/"))
    return;
  if (pending.kind === "purchase" && path !== "/account/orders") return;
  const reference = pending.kind === "booking" ? path.split("/").at(-1) : null;
  let attempts = 0;
  async function attempt() {
    if (!permitted || attempts++ >= 4) return;
    try {
      const r = await fetch("/api/v1/engagement/conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visit: pending.visit,
          kind: pending.kind,
          reference,
        }),
      });
      if (r.ok && (await r.json()).converted) {
        sessionStorage.removeItem(pendingKey);
        return;
      }
    } catch {}
    if (permitted) setTimeout(() => void attempt(), 3000);
  }
  void attempt();
}
