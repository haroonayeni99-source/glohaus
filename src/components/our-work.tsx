"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronUp, Pin, Play, Volume2, VolumeX, X } from "lucide-react";
import type { PublicSocialPost } from "@/modules/business-tools/domain";
import { SocialCard, SocialThumbnail } from "./social-portfolio";
import "./our-work.css";

type Asset = { id: string; alt_text: string; media_type?: "image" | "video"; speciality_ids?: string[]; speciality_names?: string[] };
type Collection = { id: string; name: string };
type Item = { id: string; caption: string; collectionIds: string[]; featured: boolean; asset?: Asset; post?: PublicSocialPost };

/** Only published media supplied by the existing public repositories belongs here. */
export function OurWork({ assets, posts, businessName, services, collections }: {
  assets: Asset[];
  posts: PublicSocialPost[];
  businessName: string;
  services: { id: string; speciality_id?: string | null }[];
  collections: Collection[];
}) {
  const [collection, setCollection] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const historyEntry = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const items: Item[] = [
    ...assets.map(asset => ({ id: `upload-${asset.id}`, caption: asset.alt_text, collectionIds: asset.speciality_ids ?? [], featured: false, asset })),
    ...posts.filter(post => post.publication_status === "published").map(post => ({
      id: `social-${post.id}`, caption: post.caption, featured: Boolean(post.featured), post,
      collectionIds: services.filter(service => service.id === post.service_id && service.speciality_id).map(service => service.speciality_id!),
    })),
  ].sort((a, b) => Number(b.featured) - Number(a.featured));
  const visible = items.filter(item => collection === "all" || item.collectionIds.includes(collection));
  const index = visible.findIndex(item => item.id === selected);
  const current = visible[index];
  const availableCollections = collections.filter(group => items.some(item => item.collectionIds.includes(group.id)));

  const isOpen = selected !== null;
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
      opener.current?.focus();
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
    if (visible[index + delta]) setSelected(visible[index + delta].id);
  }
  return (
    <section id="portfolio" className="professional-section our-work">
      <span id="our-work" className="our-work-anchor" />
      <p className="eyebrow">THE WORK SPEAKS</p>
      <h2>Our Work</h2>
      {items.length > 0 && <nav className="our-work-collections" aria-label="Work collections">
        {[{ id: "all", name: "All" }, ...availableCollections].map(group => <button key={group.id} type="button" aria-pressed={collection === group.id} onClick={() => setCollection(group.id)}>{group.name}</button>)}
      </nav>}
      {visible.length ? <div className="our-work-grid">
        {visible.map((item, position) => <button type="button" className="our-work-tile" key={item.id}
          aria-label={`Open work ${position + 1}: ${item.caption || businessName}`}
          onClick={event => {
            opener.current = event.currentTarget;
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
      <dialog ref={dialog} className="our-work-viewer" aria-label={`Work by ${businessName}`} onCancel={event => { event.preventDefault(); close(); }}>
        {current && <>
          <header><strong>{businessName}</strong><button type="button" aria-label="Close work viewer" onClick={close}><X aria-hidden /></button></header>
          <div className="our-work-stage" onTouchStart={event => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
            onTouchEnd={event => {
              const start = touch.current; touch.current = null;
              if (!start) return;
              const end = event.changedTouches[0];
              const dy = end.clientY - start.y;
              if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(end.clientX - start.x) * 1.5) move(dy < 0 ? 1 : -1);
            }}>
            {current.post ? <SocialCard key={current.id} post={current.post} /> : current.asset?.media_type === "video" ?
              <WorkVideo key={current.id} id={current.asset.id} label={current.caption} /> :
              <Image key={current.id} src={`/api/media/${current.asset!.id}`} alt={current.caption} width={900} height={1600} unoptimized />}
          </div>
          <footer>
            {!current.post && <p>{current.caption}</p>}
            {current.post?.service_id && current.post.service_name && <Link className="button" href={`/p/${current.post.slug}/services/${current.post.service_id}`}>Book this look</Link>}
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
function WorkVideo({ id, label }: { id: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  return <div className="our-work-video"><video ref={ref} src={`/api/media/${id}`} controls muted={muted} onVolumeChange={event => setMuted(event.currentTarget.muted)} playsInline preload="metadata" aria-label={label} /><button type="button" aria-label={muted ? "Turn sound on" : "Mute sound"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}{muted ? "Sound off" : "Sound on"}</button></div>;
}
