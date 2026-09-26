"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProfessionalPresentationInput } from "@/modules/professionals/domain";

type PlanKey = "starter" | "pro" | "premium";

export function ProfessionalProfileCustomization({
  planKey,
  initial,
}: {
  planKey: PlanKey;
  initial: ProfessionalPresentationInput;
}) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (planKey === "starter")
    return (
      <section className="pro-panel">
        <p className="pro-kicker">PROFILE CUSTOMISATION</p>
        <h2>Make your storefront feel more like your brand.</h2>
        <p>
          Pro and Premium unlock extra profile presentation choices while
          Starter keeps the standard GLOHAUS storefront.
        </p>
        <Link className="button small" href="/professional/plans">
          Compare plans
        </Link>
      </section>
    );

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        "/api/v1/professional/profile/presentation",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.code === "PLAN_REQUIRED"
            ? "An active Pro or Premium plan is required."
            : "Could not save your profile presentation.",
        );
      setMessage("Profile presentation saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save your profile presentation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pro-panel">
      <div className="pro-panel-title">
        <div>
          <p className="pro-kicker">PROFILE CUSTOMISATION</p>
          <h2>Choose how your public storefront feels.</h2>
        </div>
        <span className="pro-status pro-status-confirmed">
          {planKey === "premium" ? "Premium" : "Pro"}
        </span>
      </div>

      <div className="field-grid">
        <label>
          Profile style
          <select
            value={settings.profileStyle}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                profileStyle: event.target.value as ProfessionalPresentationInput["profileStyle"],
              }))
            }
          >
            <option value="signature">Signature</option>
            <option value="minimal">Minimal</option>
            <option value="editorial">Editorial</option>
          </select>
          <small>
            Signature keeps the full GLOHAUS look. Minimal strips the page back.
            Editorial makes the hero and headings more prominent.
          </small>
        </label>

        <label>
          Portfolio layout
          <select
            value={settings.portfolioLayout}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                portfolioLayout: event.target.value as ProfessionalPresentationInput["portfolioLayout"],
              }))
            }
          >
            <option value="grid">Balanced grid</option>
            <option value="feature">Featured first image</option>
          </select>
        </label>

        <label>
          Service menu
          <select
            value={settings.serviceStyle}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                serviceStyle: event.target.value as ProfessionalPresentationInput["serviceStyle"],
              }))
            }
          >
            <option value="cards">GLOHAUS cards</option>
            <option value="clean">Clean list</option>
          </select>
        </label>
      </div>

      <div className="editor-actions">
        <button className="button" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save presentation"}
        </button>
        <Link className="text-link" href="/professional-preview">
          Preview GLOHAUS layout
        </Link>
      </div>
      {message && <p className="form-notice" role="status">{message}</p>}
    </section>
  );
}
