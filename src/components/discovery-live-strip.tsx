"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Clock3, X } from "lucide-react";
import type { PublicStory } from "@/modules/stories/domain";
import type { LastMinuteSlot } from "@/modules/last-minute/domain";
import { ContentReportButton } from "./content-report-button";

function londonDate(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function DiscoveryLiveStrip({
  stories,
  lastMinute,
}: {
  stories: PublicStory[];
  lastMinute: LastMinuteSlot[];
}) {
  const [activeStory, setActiveStory] = useState<PublicStory | null>(null);

  return (
    <>
      {(stories.length > 0 || lastMinute.length > 0) && (
        <section className="live-discovery">
          {stories.length > 0 && (
            <div className="story-rail" aria-label="Professional Stories">
              <div className="live-section-title">
                <strong>Stories</strong>
                <span>What professionals are doing now</span>
              </div>
              <div className="story-rail-scroll">
                {stories.map((story) => (
                  <button
                    type="button"
                    className="story-bubble"
                    key={story.id}
                    onClick={() => setActiveStory(story)}
                  >
                    <span className="story-ring">
                      {story.media_type === "video" ? (
                        <video
                          src={`/api/media/${story.asset_id}`}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <Image
                          src={`/api/media/${story.asset_id}`}
                          width={76}
                          height={76}
                          unoptimized
                          alt=""
                        />
                      )}
                    </span>
                    <strong>{story.business_name}</strong>
                    <small>{story.city}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {lastMinute.length > 0 && (
            <div className="last-minute-rail">
              <div className="live-section-title">
                <strong>Last minute</strong>
                <span>Free appointments that just opened up</span>
              </div>
              <div className="last-minute-scroll">
                {lastMinute.map((slot) => (
                  <article className="last-minute-card" key={slot.id}>
                    <span className="last-minute-badge">
                      <Clock3 size={14} /> LAST MINUTE
                    </span>
                    <strong>{slot.service_name}</strong>
                    <p>{slot.business_name} · {slot.city}</p>
                    <time dateTime={slot.starts_at}>
                      {new Intl.DateTimeFormat("en-GB", {
                        timeZone: "Europe/London",
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(slot.starts_at))}
                    </time>
                    <span>£{(slot.price_pence / 100).toFixed(0)}</span>
                    <Link
                      href={`/p/${slot.slug}?bookService=${encodeURIComponent(slot.service_id)}&bookDate=${encodeURIComponent(londonDate(slot.starts_at))}&bookTime=${encodeURIComponent(slot.starts_at)}#booking`}
                    >
                      Book this slot
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {activeStory && (
        <div
          className="story-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeStory.business_name} Story`}
        >
          <button
            type="button"
            className="story-close"
            aria-label="Close Story"
            onClick={() => setActiveStory(null)}
          >
            <X size={20} />
          </button>
          <div className="story-viewer-media">
            {activeStory.media_type === "video" ? (
              <video
                src={`/api/media/${activeStory.asset_id}`}
                autoPlay
                controls
                playsInline
              />
            ) : (
              <Image
                src={`/api/media/${activeStory.asset_id}`}
                width={900}
                height={1500}
                unoptimized
                alt={activeStory.caption || `${activeStory.business_name} Story`}
              />
            )}
          </div>
          <div className="story-viewer-copy">
            <Link href={`/p/${activeStory.slug}`}>
              <strong>{activeStory.business_name}</strong>
              <span>{activeStory.city}</span>
            </Link>
            {activeStory.caption && <p>{activeStory.caption}</p>}
            <ContentReportButton targetType="media" targetId={activeStory.asset_id} label="Report Story" />
            {activeStory.service_id && (
              <Link
                className="button"
                href={`/p/${activeStory.slug}?bookService=${encodeURIComponent(activeStory.service_id)}#booking`}
              >
                {activeStory.service_name
                  ? `Book ${activeStory.service_name}`
                  : "Book this professional"}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
