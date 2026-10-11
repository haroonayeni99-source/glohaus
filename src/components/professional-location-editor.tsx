"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GeographicMap } from "./geographic-map";
import {
  coordinatesSchema,
  type Coordinates,
  type PublicLocation,
} from "@/modules/professionals/location";

export function ProfessionalLocationEditor() {
  const router = useRouter();
  const [saved, setSaved] = useState<PublicLocation | null>(null);
  const [point, setPoint] = useState<Coordinates | null>(null);
  const [focus, setFocus] = useState<Coordinates>();
  const [source, setSource] = useState<"pin" | "device">("pin");
  const [consent, setConsent] = useState(false);
  const [postcode, setPostcode] = useState("");
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/v1/professional/profile/location", {
      signal: AbortSignal.timeout(8000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((result) => {
        if (!active) return;
        setSaved(result.location);
        setPoint(result.location);
        if (result.location) setFocus(result.location);
        setReady(true);
      })
      .catch(() => {
        if (active)
          setNotice(
            "Could not load your public pin. Refresh the page to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);
  function choose(value: Coordinates, method: "pin" | "device" = "pin") {
    setPoint(value);
    setSource(method);
    setConsent(false);
    setNotice(
      "Pin selected. Check it marks your public studio, then confirm below.",
    );
  }
  async function findPostcode() {
    const code = postcode.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(code)) {
      setNotice("Enter a full UK business postcode.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(code)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error();
      const data = await response.json();
      const parsed = coordinatesSchema.safeParse({
        latitude: data.result?.latitude,
        longitude: data.result?.longitude,
      });
      if (!parsed.success) throw new Error();
      setFocus(parsed.data);
      setPoint(null);
      setConsent(false);
      setNotice(
        "Postcode area found. This is an area centre. Choose your actual studio pin on the street map before publishing.",
      );
    } catch {
      setNotice(
        "Could not find that postcode. Check it, or choose your studio on the map.",
      );
    } finally {
      setBusy(false);
    }
  }
  function useDevice() {
    if (!navigator.geolocation) {
      setNotice("Device location is unavailable. Use the street map instead.");
      return;
    }
    setBusy(true);
    setNotice("Checking this device’s location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        const parsed = coordinatesSchema.safeParse({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (
          !parsed.success ||
          !Number.isFinite(coords.accuracy) ||
          coords.accuracy > 100
        ) {
          setNotice(
            "Device location is too approximate for a studio pin. Use the street map instead.",
          );
          return;
        }
        setFocus(parsed.data);
        choose(parsed.data, "device");
      },
      () => {
        setBusy(false);
        setNotice(
          "Location was not available. You can still choose your studio on the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }
  async function save(remove = false) {
    if (!remove && (!point || !consent)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/professional/profile/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          remove ? { confirmed: false } : { ...point, confirmed: true, source },
        ),
      });
      if (!response.ok) throw new Error();
      if (remove) {
        setSaved(null);
        setPoint(null);
        setConsent(false);
      } else
        setSaved({ ...point!, confirmed_at: new Date().toISOString(), source });
      setNotice(
        remove
          ? "Public pin removed. Your area details remain available."
          : "Public business pin saved. It appears on Explore when your profile is published.",
      );
      router.refresh();
    } catch {
      setNotice("Could not save your public pin. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="professional-location-editor"
      aria-labelledby="public-pin-heading"
    >
      <h2 id="public-pin-heading">Your public map pin</h2>
      <p>
        Help clients find your studio and compare real distances. Only publish a
        business location you want everyone to see. Keep a private home address
        private.
      </p>
      <p className="form-notice" role="status">
        {notice ||
          (!ready
            ? "Loading your public pin…"
            : saved
              ? "You have a professional-confirmed public pin. You can update or remove it below."
              : "No public pin yet. Your city and area details still appear normally.")}
      </p>
      {!ready && notice && (
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setNotice("");
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Retry loading public pin
        </button>
      )}
      <div className="geo-editor-tools">
        <label>
          Business postcode
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            autoComplete="off"
            maxLength={10}
            placeholder="For example, SW1A 1AA"
          />
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={busy || !ready}
          onClick={findPostcode}
        >
          Find postcode area
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy || !ready}
          onClick={useDevice}
        >
          Use my location at the studio
        </button>
      </div>
      <small>
        Postcode lookup shares the business postcode with Postcodes.io. It finds
        an area centre; you must select the exact studio yourself.
      </small>
      <GeographicMap
        focus={focus}
        initialZoom={17}
        pins={
          point
            ? [
                {
                  ...point,
                  id: "studio",
                  label: "Selected public business pin",
                },
              ]
            : []
        }
        onChoose={(p) => choose(p)}
      />
      {point && (
        <p>
          Selected pin: {point.latitude.toFixed(5)},{" "}
          {point.longitude.toFixed(5)} ·{" "}
          <a
            href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=18/${point.latitude}/${point.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Check this pin on OpenStreetMap
          </a>
        </p>
      )}
      <label className="policy-check">
        <input
          type="checkbox"
          checked={consent}
          disabled={!point || !ready || busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I confirm this pin marks my business location and agree to show it
        publicly on GLOHAUS.
      </label>
      <div className="geo-editor-actions">
        <button
          className="button"
          type="button"
          disabled={!ready || busy || !point || !consent}
          onClick={() => save()}
        >
          Publish public pin
        </button>
        {saved && (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => save(true)}
          >
            Remove public pin
          </button>
        )}
      </div>
    </section>
  );
}
