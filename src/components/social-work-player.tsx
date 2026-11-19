"use client";

import { useEffect, useRef, useState } from "react";
import { socialPostLink, type PublicSocialPost } from "@/modules/business-tools/domain";
import { SocialThumbnail } from "./social-portfolio";

type Phase = "loading" | "displayed" | "ready" | "playing" | "unconfirmed" | "error";

/** A selected, published post only. No provider request is made before visitor consent. */
export function SocialWorkPlayer({ post, autoplay = false }: { post: PublicSocialPost; autoplay?:boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [muted,setMuted]=useState(true);
  const [autoplayBlocked,setAutoplayBlocked]=useState(false);
  let link: ReturnType<typeof socialPostLink> | null = null;
  try {
    const parsed = socialPostLink(post.original_url);
    if (parsed.platform === post.platform) link = parsed;
  } catch {
    // Never put arbitrary or mismatched URLs into frames or external links.
  }
  const name = post.platform === "tiktok" ? "TikTok" : "Instagram";
  const unavailable = post.source_available === false || post.publication_status !== "published";
  const origin = post.platform === "tiktok" ? "https://www.tiktok.com" : "https://www.instagram.com";
  const canAutoplay=autoplay && !(typeof window!=='undefined' && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const src = link?.platform === "tiktok"
    ? `${origin}/player/v1/${link.externalId}?autoplay=${canAutoplay?1:0}&controls=1${canAutoplay?"&muted=1":""}`
    : link ? `${link.url}embed/` : "";

  useEffect(() => {
    if (!loaded || unavailable || !src) return;
    const timer = window.setTimeout(() => {
      setPhase(current => current === "loading" ? "unconfirmed" : current);
    }, 15000);
    function receive(event: MessageEvent) {
      if (post.platform !== "tiktok" || event.origin !== origin ||
        !frame.current?.contentWindow || event.source !== frame.current.contentWindow ||
        !event.data || typeof event.data !== "object" || event.data["x-tiktok-player"] !== true) return;
      if (event.data.type === "onPlayerReady") {
        setPhase("ready");
        if(autoplay&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){
          frame.current.contentWindow.postMessage({type:'mute','x-tiktok-player':true},origin);
          frame.current.contentWindow.postMessage({type:'play','x-tiktok-player':true},origin);
        }
      }
      else if (event.data.type === "onStateChange" && event.data.value === 1) setPhase("playing");
      else if (event.data.type === "onStateChange" && [0, 2].includes(event.data.value)) setPhase("ready");
      else if(event.data.type==='onMute' && typeof event.data.value==='boolean')setMuted(event.data.value);
      else if (event.data.type === "onPlayerError" || event.data.type === "onError") {
        if(event.data.value?.errorCode===3002||event.data.value===3002){setAutoplayBlocked(true);setPhase('ready');}
        else setPhase("error");
      }
    }
    const element = frame.current;
    const failed = () => setPhase("error");
    element?.addEventListener("error", failed);
    window.addEventListener("message", receive);
    return () => {
      element?.removeEventListener("error", failed);
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [loaded, unavailable, src, origin, post.platform, attempt, autoplay]);

  const active = loaded && phase !== "error" && !unavailable && Boolean(src);
  const status = unavailable
    ? `${name} reports this source as unavailable. You can check the original post.`
    : !link
      ? "This post does not have a supported embed link."
      : phase === "error"
        ? `${name} could not display this post. It may be private, deleted or restricted, or embedding may be disabled. View the original if available.`
        : phase === "unconfirmed"
          ? `The ${name} player has not confirmed that it is available. If it is blank or blocked, try again or view the original.`
          : phase === "playing"
            ? "Playing here on GLOHAUS via TikTok."
            : phase === "ready"
              ? "TikTok player ready. Use the video's play/pause and sound controls."
              : phase === "displayed"
                ? "Instagram frame opened. Use the post's playback controls where available. If the post cannot play here, view the original."
                : `Opening the ${name} player…`;
  return <article className="our-work-social-player" aria-label={`${name} work by ${post.business_name}`}>
    {!active && <SocialThumbnail post={post} />}
    <p className="our-work-social-attribution"><strong>{name}</strong> · {post.business_name}</p>
    {active ? <>
      <iframe key={`${post.id}-${attempt}`} ref={frame} src={src}
        title={`${name} work by ${post.business_name}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => { if (post.platform === "instagram") setPhase(current => current === "loading" || current === "unconfirmed" ? "displayed" : current); }} />
      <p role="status">{autoplayBlocked?'Automatic playback was blocked. Press Play to watch here.':status}</p>
      {autoplay&&post.platform==='tiktok'&&['ready','playing'].includes(phase)&&<div className="our-work-provider-controls">
        <button type="button" onClick={()=>{frame.current?.contentWindow?.postMessage({type:phase==='playing'?'pause':'play','x-tiktok-player':true},origin);setAutoplayBlocked(false);}}>{phase==='playing'?'Pause TikTok video':'Play TikTok video'}</button>
        <button type="button" onClick={()=>frame.current?.contentWindow?.postMessage({type:muted?'unMute':'mute','x-tiktok-player':true},origin)}>{muted?'Turn TikTok sound on':'Mute TikTok sound'}</button>
      </div>}
      <button type="button" onClick={() => setLoaded(false)}>Unload {name} player</button>
      {phase === "unconfirmed" && <button type="button" onClick={() => { setPhase("loading"); setAttempt(value => value + 1); }}>Retry {name} player</button>}
    </> : <>
      {(unavailable || !link || phase === "error") && <p role="status">{status}</p>}
      {!unavailable && link && <>
        <p>Load {name} to watch here on GLOHAUS. This connects to {name}, which may use cookies and process device information. Use its play/pause and sound controls where supported.</p>
        <button type="button" onClick={() => { setPhase("loading"); setLoaded(true); setAttempt(value => value + 1); }}>
          {phase === "error" ? `Retry ${name} player` : `Load ${name} ${post.media_type === "video" || post.platform === "tiktok" ? "video" : "post"}`}
        </button>
      </>}
    </>}
    {link && <a className="our-work-original" href={link.url} target="_blank" rel="noopener noreferrer">View on {name} ↗</a>}
    {post.caption && <p className="our-work-social-caption">{post.caption}</p>}
  </article>;
}
