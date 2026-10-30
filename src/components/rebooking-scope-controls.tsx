"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CustomerRebookingScope,
  ProfessionalRebookingScope,
} from "@/modules/rebooking/scope";
async function saveScope(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error("Save could not be confirmed. Refresh before retrying.");
}
export function CustomerRebookingControls({
  scopes,
}: {
  scopes: CustomerRebookingScope[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(
    event: FormEvent<HTMLFormElement>,
    scope: CustomerRebookingScope,
  ) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const enabled = new FormData(event.currentTarget).get("enabled") === "on";
    try {
      await saveScope("/api/v1/account/rebooking", {
        professionalId: scope.professionalId,
        channel: "email",
        enabled,
      });
      setMessage("Your choice was saved.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Save could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        Choose optional email reminders for each professional you have visited.
        Your general rebooking email preference must also be on. You can
        withdraw either choice at any time. Saving does not book an appointment.
      </p>
      {scopes.length === 0 && (
        <p>
          No completed paid visits are available for reminder preferences yet.
        </p>
      )}
      {scopes.map((scope) => (
        <form
          className="editor-form"
          key={scope.professionalId}
          onSubmit={(event) => void save(event, scope)}
        >
          <label>
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={scope.enabled}
              disabled={busy}
            />{" "}
            Email me optional reminders to book again with{" "}
            {scope.businessName || "this professional"} through GLOHAUS.
          </label>
          <button type="submit" className="button small" disabled={busy}>
            Save choice
          </button>
        </form>
      ))}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
export function ProfessionalRebookingControls({
  settings,
}: {
  settings: ProfessionalRebookingScope;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>, serviceId?: string) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const value = String(form.get("delayDays") ?? "");
    const payload = serviceId
      ? { serviceId, delayDays: value === "" ? null : Number(value) }
      : { paused: form.get("paused") === "on", delayDays: Number(value) };
    try {
      await saveScope("/api/v1/professional/rebooking", payload);
      setMessage("Reminder settings saved.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Save could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        These settings propose reminders only for consenting customers. The
        GLOHAUS Owner must separately enable the pilot. Pausing suppresses
        waiting reminders; it cannot recall email already submitted. Intervals
        are optional marketing timings, not treatment advice.
      </p>
      <form className="editor-form" onSubmit={(event) => void save(event)}>
        <label>
          <input
            name="paused"
            type="checkbox"
            defaultChecked={settings.paused}
            disabled={busy}
          />{" "}
          Pause my rebooking reminders
        </label>
        <label>
          Default days after a completed visit
          <input
            name="delayDays"
            type="number"
            min={14}
            max={180}
            required
            defaultValue={settings.delayDays}
            disabled={busy}
          />
        </label>
        <button type="submit" className="button" disabled={busy}>
          Save reminder settings
        </button>
      </form>
      {settings.services.map((service) => (
        <form
          className="editor-form"
          key={service.serviceId}
          onSubmit={(event) => void save(event, service.serviceId)}
        >
          <label>
            {service.name}: days after a completed visit
            <input
              name="delayDays"
              type="number"
              min={14}
              max={180}
              defaultValue={service.delayDays ?? ""}
              disabled={busy}
            />
          </label>
          <p>Leave blank to use your default interval.</p>
          <button type="submit" className="button small" disabled={busy}>
            Save service interval
          </button>
        </form>
      ))}
      <p>
        Emails are sent only between 9am and 8pm, London time, subject to the
        platform cooldown and caps.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
