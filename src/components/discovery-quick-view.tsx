"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import type { PublicProfessional } from "@/modules/professionals/domain";
import { money } from "@/modules/professionals/domain";
import { serviceDeepLink } from "@/modules/taxonomy/domain";
import { ProfessionalVerificationBadges } from "./professional-verification-badges";
import { ProfessionalDirections } from "./professional-directions";
type Preview = {
  services: {
    id: string;
    name: string;
    price_pence: number;
    duration_minutes: number;
    speciality_id?: string | null;
  }[];
  assets: { id: string; alt_text: string; media_type: "image" | "video" }[];
};
export function DiscoveryQuickView({
  professional: pro,
  onClose,
}: {
  professional: PublicProfessional;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch(`/api/v1/explore/professionals/${encodeURIComponent(pro.slug)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "This preview could not load. Open the profile or try again.",
          );
        return r.json();
      })
      .then(setPreview)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [pro.slug]);
  return (
    <dialog
      ref={dialog}
      className="discovery-preview"
      aria-labelledby="preview-name"
      onCancel={onClose}
      onClose={onClose}
    >
      <button
        type="button"
        className="preview-close"
        aria-label="Close quick view"
        onClick={onClose}
      >
        <X size={22} />
      </button>
      <p className="eyebrow">GLOHAUS · QUICK VIEW</p>
      <h2 id="preview-name">{pro.business_name}</h2>
      <ProfessionalVerificationBadges professional={pro} />
      <p>
        {pro.city} ·{" "}
        {pro.travels_to_you ? "Travels to you" : "Visit professional"}
      </p>
      <p>{pro.bio}</p>
      <ProfessionalDirections professional={pro} />
      {error && <p role="alert">{error}</p>}
      {!preview && !error && (
        <p role="status">Loading portfolio and services…</p>
      )}
      {!!preview?.assets.length && (
        <div
          className="discovery-preview-media"
          aria-label="Professional portfolio"
        >
          {preview.assets.map((a) =>
            a.media_type === "video" ? (
              <video
                key={a.id}
                src={`/api/media/${a.id}`}
                aria-label={a.alt_text || "Portfolio video"}
                controls
                playsInline
                preload="none"
              />
            ) : (
              <Image
                key={a.id}
                src={`/api/media/${a.id}`}
                alt={a.alt_text || "Portfolio image"}
                width={280}
                height={280}
                unoptimized
              />
            ),
          )}
        </div>
      )}
      {preview && (
        <div className="discovery-preview-services">
          <h3>Services</h3>
          {preview.services.length ? (
            preview.services.slice(0, 8).map((s) => (
              <Link
                key={s.id}
                href={serviceDeepLink(pro.slug, s.id, s.speciality_id)}
              >
                <span>
                  {s.name}
                  <small>{s.duration_minutes} minutes</small>
                </span>
                <strong>From {money(s.price_pence)}</strong>
              </Link>
            ))
          ) : (
            <p>No bookable services are currently published.</p>
          )}
        </div>
      )}
      <Link className="button" href={`/p/${pro.slug}`}>
        View full profile & book
      </Link>
    </dialog>
  );
}
