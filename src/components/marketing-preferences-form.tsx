"use client";

import { useMemo, useState } from "react";

type Prefs = Record<string, boolean>;

const customerOptions = [
  ["customerOffers","Offers & promotions","Commercial offers and GLOHAUS promotions."],
  ["newProfessionals","New professionals near me","New professionals and services available through GLOHAUS."],
  ["availability","Availability & last-minute appointments","Fresh slots and last-minute appointment opportunities."],
  ["discover","Beauty inspiration & Discover","Trending looks, tutorials and professional work."],
  ["shop","Shop products & offers","Relevant GLOHAUS Shop products and seller offers."],
  ["rebooking","Rebooking reminders","Optional reminders when it may be time to book again."],
] as const;

const professionalOptions = [
  ["professionalGrowth","GLOHAUS growth tips","Ways to improve your profile, content and booking potential."],
  ["marketplaceFeatures","New marketplace features","Updates about new professional tools and capabilities."],
  ["professionalPromotions","Promotions & referral opportunities","Optional commercial and referral opportunities."],
  ["academy","Professional Academy","Educational and business-building content."],
  ["milestones","Business performance & milestones","Optional progress, milestone and activity updates."],
  ["shopSelling","Shop-selling opportunities","Ways to improve product listings, stock and Shop sales."],
] as const;

export function MarketingPreferencesForm({
  initial,
  professional,
}: {
  initial: Prefs;
  professional: boolean;
}) {
  const options = useMemo(
    () => professional ? [...customerOptions, ...professionalOptions] : customerOptions,
    [professional],
  );
  const [values,setValues] = useState<Prefs>(initial);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");

  async function save(next: Prefs) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/v1/account/marketing-preferences", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Preferences could not be saved.");
      setValues(next);
      setNotice("Marketing preferences saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Preferences could not be saved.");
    } finally { setBusy(false); }
  }

  return (
    <section className="marketing-preferences">
      <div className="service-edit-list">
        {options.map(([key,label,description]) => (
          <label className="service-edit-row marketing-preference-row" key={key}>
            <div>
              <h3>{label}</h3>
              <p>{description}</p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(values[key])}
              disabled={busy}
              onChange={(event) => void save({...values,[key]:event.target.checked})}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={() => void save(Object.fromEntries(Object.keys(values).map((key)=>[key,false])))}
      >
        Unsubscribe from all optional marketing
      </button>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </section>
  );
}
