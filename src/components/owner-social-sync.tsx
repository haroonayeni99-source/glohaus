"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerSocialOverview } from "@/modules/business-tools/domain";
import "./business-tools.css";
export function OwnerSocialSync({ initial }: { initial: OwnerSocialOverview }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const router = useRouter();
  async function save(professionalId: string | null, form: HTMLFormElement) {
    if (busy) return;
    const data = new FormData(form);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/social-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId,
          enabled: data.get("enabled") === "on",
          reason: data.get("reason"),
        }),
      });
      if (!response.ok)
        throw Error("Could not save. Check your Owner session and try again.");
      setNotice(
        "Portfolio syncing settings saved. Existing profiles and bookings stay available.",
      );
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London" })
      : "Not yet synced";
  return (
    <div className="business-tools owner-social-sync">
      <h3>Social portfolio oversight — Owner only</h3>
      <p>
        Pause imports globally or for a professional. This does not delete
        profiles or change bookings, payments or the professional’s choice of
        published work. Provider approval is still required before account
        authorisation is enabled.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(null, e.currentTarget);
        }}
      >
        <label className="business-check">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={initial.enabled}
          />
          Allow social portfolio syncing globally
        </label>
        <label>
          Reason for global change
          <input name="reason" minLength={5} maxLength={500} required />
        </label>
        <button className="button" disabled={busy}>
          Save global portfolio setting
        </button>
      </form>
      <div className="admin-table-scroll">
        <table>
          <caption>Instagram and TikTok account health</caption>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Connected accounts</th>
              <th>Successful syncs</th>
              <th>Failed syncs</th>
              <th>Reconnect needed</th>
              <th>Last successful sync</th>
            </tr>
          </thead>
          <tbody>
            {["instagram", "tiktok"].map((provider) => {
              const row = initial.accounts.find((a) => a.provider === provider);
              return (
                <tr key={provider}>
                  <td>{provider === "instagram" ? "Instagram" : "TikTok"}</td>
                  <td>{row?.connected ?? 0}</td>
                  <td>{row?.successes ?? 0}</td>
                  <td>{row?.failures ?? 0}</td>
                  <td>{row?.reconnect ?? 0}</td>
                  <td>{date(row?.last_success ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Reported portfolios appear in the existing Safety &amp; reports
        moderation controls. The counts below include open reports about the
        professional.
      </p>
      {!initial.professionals.length && (
        <p>No connected social accounts or individual overrides yet.</p>
      )}
      {initial.professionals.map((p) => (
        <details key={p.id}>
          <summary>
            {p.business_name} · {p.paused ? "Paused by Owner" : "Sync allowed"}{" "}
            · {p.reconnect} reconnect · {p.reports} open reports
          </summary>
          <p>
            {p.connected} connected accounts. Last success:{" "}
            {date(p.last_success)}.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(p.id, e.currentTarget);
            }}
          >
            <label className="business-check">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={!p.paused}
              />
              Allow portfolio syncing for {p.business_name}
            </label>
            <small>The global switch also needs to be enabled.</small>
            <label>
              Reason for this professional’s change
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <button className="button" disabled={busy}>
              Save professional portfolio setting
            </button>
          </form>
        </details>
      ))}
    </div>
  );
}
