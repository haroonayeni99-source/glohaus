"use client";
import { useEffect, useState } from "react";
import type { RoutingOverview } from "@/modules/journey-routing/domain";

export function AdminJourneyRouting({ owner }: { owner: boolean }) {
  const [data, setData] = useState<RoutingOverview | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = "/api/v1/admin/journey-routing";
  useEffect(() => {
    const abort = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (r.ok) setData(await r.json());
        else throw new Error();
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setNotice(
            "Routing readiness could not be loaded. Reload to try again.",
          );
      });
    return () => abort.abort();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.get("enabled") === "on",
          dailyLimit: Number(form.get("daily")),
          monthlyLimit: Number(form.get("monthly")),
          refreshMinutes: Number(form.get("refresh")),
          changeMinutes: Number(form.get("change")),
          reason: String(form.get("reason")),
        }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error();
      setData(value);
      setNotice("Routing settings saved in the audit log.");
    } catch {
      setNotice(
        "Could not save routing settings. Check configuration, MFA and permitted values.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Automatic routing & delivery readiness</summary>
      {data && (
        <>
          <p>
            Google Routes:{" "}
            {data.configured
              ? "Server credentials configured"
              : "Not configured — provider calls disabled"}
            . Routing: {data.enabled ? "Enabled" : "Off"}.
          </p>
          <p>
            Requests reserved today: {data.usedToday}/{data.dailyLimit}; this
            month: {data.usedMonth}/{data.monthlyLimit}. Failed today:{" "}
            {data.failedToday}. Active route rechecks: {data.activeRefreshes}.
          </p>
          <p>
            Email delivery receipts: {data.emailsDelivered}. Registered push
            devices: {data.registeredDevices}. Push provider acceptances:{" "}
            {data.pushAccepted}. Device-reported displays:{" "}
            {data.deviceDisplayed}. Notification clicks: {data.deviceClicked}.
          </p>
          <p>
            These delivery counts cover the existing notification system. Device
            reports and clicks do not prove that appointment instructions were
            understood. Customer acknowledgement remains separate.
          </p>
          <p>
            Physical iPhone and Android tests must be performed with consented
            devices. On iPhone, install GLOHAUS on the Home Screen and allow
            notifications where supported. Verify a displayed message, open it,
            and check the receipt and explicit acknowledgement separately.
          </p>
          {owner && (
            <form
              data-admin-decision
              onSubmit={save}
              key={`${data.enabled}-${data.dailyLimit}-${data.monthlyLimit}-${data.refreshMinutes}-${data.changeMinutes}`}
            >
              <label className="arrival-choice">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={data.enabled}
                  disabled={!data.configured || busy}
                />
                Enable Google Maps route calculations
              </label>
              <label>
                Daily request limit
                <input
                  name="daily"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={data.dailyLimit}
                  required
                />
              </label>
              <label>
                Monthly request limit
                <input
                  name="monthly"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={data.monthlyLimit}
                  required
                />
              </label>
              <label>
                Route recheck interval (minutes)
                <input
                  name="refresh"
                  type="number"
                  min={5}
                  max={60}
                  defaultValue={data.refreshMinutes}
                  required
                />
              </label>
              <label>
                Notify when journey increases by at least (minutes)
                <input
                  name="change"
                  type="number"
                  min={3}
                  max={30}
                  defaultValue={data.changeMinutes}
                  required
                />
              </label>
              <p>
                Rechecks run only in the three hours before departure, with at
                least a 20% increase and a 30-minute notification cooldown. Each
                initial calculation or recheck consumes a provider request,
                including failures. App limits do not cover other applications
                using the same Google project; configure Google quotas and
                billing alerts separately. Provider billing must be reviewed
                before activation.
              </p>
              <label>
                Reason for change
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
              <button disabled={busy}>Save routing controls</button>
            </form>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
