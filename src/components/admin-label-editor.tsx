"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  labelKeys,
  labelsSchema,
  type Labels,
} from "@/modules/platform/domain";
export function AdminLabelEditor({ initial }: { initial: Labels }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  return (
    <form
      className="editor-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const input = labelsSchema.safeParse({
          labels: Object.fromEntries(
            labelKeys.map((key) => [key, data.get(key)]),
          ),
          reason: data.get("reason"),
        });
        if (!input.success) {
          setNotice(input.error.issues[0].message);
          return;
        }
        setBusy(true);
        try {
          const response = await fetch("/api/v1/admin/labels", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input.data),
          });
          if (!response.ok) throw new Error();
          setNotice(
            "Display names updated. Roles and existing profiles are preserved.",
          );
          router.refresh();
        } catch {
          setNotice(
            "Could not update labels. Check your admin verification and try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Community names & categories</h2>
      <p>
        Change the names people see. Professional permissions and category
        assignments stay linked to their original identifiers.
      </p>
      <div className="field-grid">
        {labelKeys.map((key) => (
          <label key={key}>
            {key === "Professional"
              ? "Practitioner title (singular)"
              : key === "Professionals"
                ? "Practitioner title (plural)"
                : `${key} category`}
            <input
              name={key}
              defaultValue={initial[key]}
              minLength={2}
              maxLength={40}
              required
              disabled={busy}
            />
          </label>
        ))}
      </div>
      <label>
        Reason for this change
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          disabled={busy}
        />
      </label>
      <button className="button" disabled={busy}>
        Save display names
      </button>
      <p role="status">{notice}</p>
    </form>
  );
}
