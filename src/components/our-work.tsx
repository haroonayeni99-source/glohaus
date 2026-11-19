"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronUp, Pin, Play, Pause, Volume2, VolumeX, X } from "lucide-react";
import type { PublicSocialPost } from "@/modules/business-tools/domain";
import { SocialThumbnail } from "./social-portfolio";
import { SocialWorkPlayer } from "./social-work-player";
import "./our-work.css";

type Asset = { id: string; alt_text: string; media_type?: "image" | "video"; speciality_ids?: string[]; speciality_names?: string[] };
type Collection = { id: string; name: string };
type Item = { id: string; caption: string; collectionIds: string[]; featured: boolean; asset?: Asset; post?: PublicSocialPost };

/** Only published media supplied by the existing public repositories belongs here. */
export function OurWork({ assets, posts, businessName, services, collections, profileSlug, immersive=false }: {
  assets: Asset[];
  posts: PublicSocialPost[];
  businessName: string;
  services: { id: string; speciality_id?: string | null; asset_id?:string|null; name?:string }[];
  profileSlug?:string;
  immersive?:boolean;
  collections: Collection[];
}) {
  const [collection, setCollection] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const historyEntry = useRef(false);
  const gridScroll = useRef({x:0,y:0});
  const wheel = useRef({last:0,total:0,locked:false});
  const suppressClick = useRef(0);
  const [direction,setDirection] = useState(1);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const items: Item[] = [
    ...assets.map(asset => ({ id: `upload-${asset.id}`, caption: asset.alt_text, collectionIds: asset.speciality_ids ?? [], featured: false, asset })),
    ...posts.filter(post => post.publication_status === "published" && post.source_available !== false).map(post => ({
      id: `social-${post.id}`, caption: post.caption, featured: Boolean(post.featured), post,
      collectionIds: services.filter(service => service.id === post.service_id && service.speciality_id).map(service => service.speciality_id!),
    })),
  ].sort((a, b) => Number(b.featured) - Number(a.featured));
  const visible = items.filter(item => collection === "all" || item.collectionIds.includes(collection));
  const index = visible.findIndex(item => item.id === selected);
  const current = visible[index];
  const availableCollections = collections.filter(group => items.some(item => item.collectionIds.includes(group.id)));

  const isOpen = selected !== null;
  const next = visible[index+1];
  const nextPreview = isOpen && next ? next.post?.has_thumbnail ? `/api/v1/social-thumbnails/${next.post.id}` : next.asset?.media_type !== 'video' && next.asset ? `/api/media/${next.asset.id}` : null : null;
  useEffect(()=>{if(!nextPreview)return;const hint=document.createElement('link');hint.rel='prefetch';hint.as='image';hint.href=nextPreview;document.head.append(hint);return()=>hint.remove();},[nextPreview]);
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!element.open) element.showModal();
    const back = () => {
      historyEntry.current = false;
      setSelected(null);
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      element.close();
      document.body.style.overflow = previousOverflow;
      window.scrollTo(gridScroll.current.x,gridScroll.current.y);
      opener.current?.focus({preventScroll:true});
    };
    // Keep one dialog and history entry while navigating between items.
  }, [isOpen]);

  function close() {
    if (historyEntry.current) {
      historyEntry.current = false;
      window.history.back();
    } else setSelected(null);
  }
  function move(delta: number) {
    if (visible[index + delta]) { dialog.current?.focus({preventScroll:true}); setDirection(delta>0?1:-1); setSelected(visible[index + delta].id); }
  }
  return (
    <section id="portfolio" className="professional-section our-work">
      <span id="our-work" className="our-work-anchor" />
      <p className="eyebrow">THE WORK SPEAKS</p>
      <h2>Our Work</h2>
      {items.length > 0 && <nav className="our-work-collections" aria-label="Work collections">
        {[{ id: "all", name: "All Work" }, ...availableCollections].map(group => <button key={group.id} type="button" aria-pressed={collection === group.id} onClick={() => setCollection(group.id)}>{group.name}</button>)}
      </nav>}
      {visible.length ? <div className="our-work-grid">
        {visible.map((item, position) => <button type="button" className="our-work-tile" key={item.id}
          aria-label={`Open work ${position + 1}: ${item.caption || businessName}`}
          onClick={event => {
            opener.current = event.currentTarget;
            gridScroll.current={x:window.scrollX,y:window.scrollY};
            setDirection(1);
            window.history.pushState(window.history.state, "", "#our-work");
            historyEntry.current = true;
            setSelected(item.id);
          }}>
          {item.post ? <SocialThumbnail post={item.post} /> : item.asset?.media_type === "video" ?
            <VideoCover id={item.asset.id} label={item.caption} /> :
            <Image src={`/api/media/${item.asset!.id}`} alt={item.caption} width={360} height={640} loading="lazy" unoptimized />}
          <span className="our-work-source">{item.post ? item.post.platform === "instagram" ? "Instagram" : "TikTok" : item.asset?.media_type === "video" ? "Video" : "Photo"}</span>
          {(item.asset?.media_type === "video" || item.post?.media_type === "video" || item.post?.platform === "tiktok") && <Play className="our-work-play" aria-hidden size={24} />}
          {item.featured && <span className="our-work-pin"><Pin size={13} aria-hidden /> Pinned</span>}
          <span className="our-work-caption">{item.caption || businessName}</span>
        </button>)}
      </div> : <p className="profile-empty">{items.length ? "No published work in this collection yet." : "No portfolio media has been published yet."}</p>}
      <dialog ref={dialog} tabIndex={-1} className="our-work-viewer" aria-label={`Work by ${businessName}`} onCancel={event => { event.preventDefault(); close(); }}
        onKeyDown={event=>{if(!immersive)return;if((event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]"))return; if(["ArrowDown","PageDown","ArrowUp","PageUp"].includes(event.key)){event.preventDefault(); if(!event.repeat)move(["ArrowDown","PageDown"].includes(event.key)?1:-1);}}}>
        {current && <>
          <header><strong>{businessName}</strong><button type="button" aria-label="Close work viewer" onClick={close}><X aria-hidden /></button></header>
          <div className="our-work-stage" data-immersive={immersive} onClickCapture={event=>{if(performance.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}}}
            onWheel={event=>{if(!immersive||event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||(event.target as HTMLElement).closest("a,button,.our-work-social-caption"))return;const now=performance.now(),state=wheel.current;if(now-state.last>180){state.locked=false;state.total=0;}state.last=now;if(state.locked)return;state.total+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?event.currentTarget.clientHeight:1);if(Math.abs(state.total)>55){move(state.total>0?1:-1);state.locked=true;state.total=0;}}}
            onTouchStart={event => { if(event.touches.length!==1){touch.current=null;return;}const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
            onTouchEnd={event => {
              const start = touch.current; touch.current = null;
              if (!start) return;
              const end = event.changedTouches[0];
              const dy = end.clientY - start.y;
              if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(end.clientX - start.x) * 1.5) {suppressClick.current=performance.now()+350;move(dy < 0 ? 1 : -1);}
            }}>
            <div className="our-work-frame" key={current.id} data-direction={direction>0?"next":"previous"}>
            {current.post ? <SocialWorkPlayer post={current.post} autoplay={immersive} /> : current.asset?.media_type === "video" ?
              immersive ? <WorkVideo key={current.id} id={current.asset.id} label={current.caption} /> : <LegacyWorkVideo key={current.id} id={current.asset.id} label={current.caption} /> :
              <Image key={current.id} src={`/api/media/${current.asset!.id}`} alt={current.caption} width={900} height={1600} unoptimized />}
            </div>
            {immersive&&current.post&&<div className="our-work-gesture-rail" aria-label="Swipe or scroll here to change work"><span aria-hidden>↕</span></div>}
          </div>
          <footer>
            {!current.post && <p>{current.caption}</p>}
            {current.post?.service_id && current.post.service_name ? <Link className="button" href={`/p/${current.post.slug}/services/${current.post.service_id}`}>Book this look</Link> : current.asset && profileSlug && services.filter(service=>service.asset_id===current.asset!.id).map(service=><Link key={service.id} className="button" href={`/p/${profileSlug}/services/${service.id}`}>Book {service.name||"this look"}</Link>)}
            <div className="our-work-viewer-nav"><button type="button" aria-label="Previous work" disabled={index <= 0} onClick={() => move(-1)}><ChevronUp aria-hidden /> Previous</button><span aria-live="polite">{index + 1} / {visible.length}</span><button type="button" aria-label="Next work" disabled={index >= visible.length - 1} onClick={() => move(1)}>Next <ChevronDown aria-hidden /></button></div>
          </footer>
        </>}
      </dialog>
    </section>
  );
}

function VideoCover({ id, label }: { id: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current!;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      element.src = `/api/media/${id}#t=0.1`;
      observer.disconnect();
    }, { rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [id]);
  return <video ref={ref} preload="metadata" muted playsInline aria-label={label} />;
}
export function WorkVideo({ id, label }: { id: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true),[playing,setPlaying]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{const video=ref.current!;if(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)void video.play().catch(()=>setPlaying(false));return()=>{video.pause();video.removeAttribute('src');video.load();};},[id]);
  function toggle(){const video=ref.current!;if(video.paused)void video.play().catch(()=>setPlaying(false));else video.pause();}
  return <div className="our-work-video">
    <video ref={ref} src={`/api/media/${id}`} muted={muted} onVolumeChange={event => setMuted(event.currentTarget.muted)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setFailed(true)} playsInline loop preload="metadata" aria-label={label} />
    {!failed&&<button type="button" className="our-work-video-surface" aria-label={playing?"Pause video surface":"Play video surface"} onClick={toggle}>{!playing&&<Play aria-hidden size={48}/>}</button>}
    {failed?<p role="status" className="our-work-video-error">This video is unavailable. Continue to the next item.</p>:<div className="our-work-video-controls"><button type="button" aria-label={playing?"Pause video":"Play video"} onClick={toggle}>{playing?<Pause aria-hidden/>:<Play aria-hidden/>}{playing?'Pause':'Play'}</button><button type="button" aria-label={muted ? "Turn sound on" : "Mute sound"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}{muted ? "Sound off" : "Sound on"}</button></div>}
  </div>;
}

function LegacyWorkVideo({id,label}:{id:string;label:string}){const[muted,setMuted]=useState(true);return <div className="our-work-video our-work-video-legacy"><video src={`/api/media/${id}`} controls muted={muted} onVolumeChange={e=>setMuted(e.currentTarget.muted)} playsInline preload="metadata" aria-label={label}/><button type="button" aria-label={muted?'Turn sound on':'Mute sound'} onClick={()=>setMuted(!muted)}>{muted?<VolumeX aria-hidden/>:<Volume2 aria-hidden/>}{muted?'Sound off':'Sound on'}</button></div>;}
