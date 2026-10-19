"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requireAdminResponse } from "@/lib/admin-response";
import type { ExampleVisibility } from "@/modules/professionals/example-visibility";

export function OwnerExampleProfiles({
  initial,
  profiles,
}: {
  initial: ExampleVisibility;
  profiles: { slug: string; name: string; category: string }[];
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/profile-examples", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      await requireAdminResponse(
        response,
        "Example visibility could not be saved. Try again.",
      );
      setNotice(
        value.enabled
          ? "Saved. Selected examples are visible on Explore and in the example gallery."
          : "Saved. All example profiles are hidden from the public website.",
      );
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="owner-example-profiles">
      <p>
        Show the ten fictional profiles while introducing GLOHAUS. Hide
        individual examples or turn them all off when you no longer need them.
        You can restore them here.
      </p>
      <fieldset
        disabled={busy}
        onChange={() =>
          setNotice("Unsaved changes. Save to update the live website.")
        }
      >
        <label>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
          />{" "}
          Show example profiles on the live website
        </label>
        <div className="owner-example-profile-list">
          {profiles.map((p) => (
            <label key={p.slug}>
              <input
                type="checkbox"
                checked={!value.hiddenSlugs.includes(p.slug)}
                onChange={(e) =>
                  setValue({
                    ...value,
                    hiddenSlugs: e.target.checked
                      ? value.hiddenSlugs.filter((s) => s !== p.slug)
                      : [...value.hiddenSlugs, p.slug],
                  })
                }
              />{" "}
              <span>
                {p.name} <small>{p.category}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save example visibility"}
      </button>{" "}
      <Link href="/explore">View live listings</Link>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
