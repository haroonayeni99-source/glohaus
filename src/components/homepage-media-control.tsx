"use client";

import { useState } from "react";
import Image from "next/image";

export function HomepageMediaControl({
  initial,
}: {
  initial: { desktopHero: string | null; mobileHero: string | null };
}) {
  const [desktopHero, setDesktopHero] = useState(initial.desktopHero ?? "");
  const [mobileHero, setMobileHero] = useState(initial.mobileHero ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/homepage-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desktopHero: desktopHero.trim() || null,
          mobileHero: mobileHero.trim() || null,
          reason,
        }),
      });
      if (!response.ok)
        throw new Error("Homepage imagery could not be saved.");
      setNotice("Homepage model imagery updated.");
      setReason("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Homepage imagery could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor-form" onSubmit={save}>
      <h3>Homepage models</h3>
      <p className="lead">
        Change the main model image separately for desktop and mobile. Leave a field blank to use the GLOHAUS default image.
      </p>

      <label>
        Desktop hero model image URL
        <input
          type="url"
          inputMode="url"
          placeholder="https://..."
          value={desktopHero}
          onChange={(event) => setDesktopHero(event.target.value)}
        />
      </label>
      {desktopHero && (
        <div className="owner-homepage-media-preview">
          <Image
            src={desktopHero}
            alt="Desktop homepage model preview"
            width={560}
            height={320}
            unoptimized
          />
        </div>
      )}

      <label>
        Mobile hero model image URL
        <input
          type="url"
          inputMode="url"
          placeholder="https://..."
          value={mobileHero}
          onChange={(event) => setMobileHero(event.target.value)}
        />
      </label>
      {mobileHero && (
        <div className="owner-homepage-media-preview">
          <Image
            src={mobileHero}
            alt="Mobile homepage model preview"
            width={360}
            height={420}
            unoptimized
          />
        </div>
      )}

      <label>
        Reason for change
        <input
          value={reason}
          minLength={5}
          maxLength={500}
          required
          placeholder="e.g. Refresh homepage imagery for a more relatable campaign"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <div className="editor-actions">
        <button className="button" disabled={busy || reason.trim().length < 5}>
          {busy ? "Saving…" : "Save homepage models"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDesktopHero("");
            setMobileHero("");
            setNotice("Defaults selected. Save to apply.");
          }}
        >
          Use GLOHAUS defaults
        </button>
      </div>

      {notice && <p className="form-notice" role="status">{notice}</p>}
    </form>
  );
}
