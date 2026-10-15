"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  TaxonomyCatalog,
  ProfessionalSelection,
} from "@/modules/taxonomy/domain";
export function SpecialityEditor({
  catalog,
  selection,
}: {
  catalog: TaxonomyCatalog;
  selection: ProfessionalSelection;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    selection.specialityIds.filter((id) =>
      catalog.specialities.some((s) => s.id === id),
    ),
  );
  const [primary, setPrimary] = useState(
    catalog.specialities.some((s) => s.id === selection.primarySpecialityId)
      ? selection.primarySpecialityId!
      : "",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const removed = selection.specialityIds.filter(
    (id) => !selected.includes(id),
  );
  const paused = removed.reduce(
    (n, id) => n + (selection.publishedBySpeciality[id] ?? 0),
    0,
  );
  return (
    <form
      className="editor-form"
      id="specialities"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        try {
          const response = await fetch("/api/v1/professional/specialities", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryIds: [
                ...new Set(
                  catalog.specialities
                    .filter((s) => selected.includes(s.id))
                    .map((s) => s.category_id),
                ),
              ],
              specialityIds: selected,
              primarySpecialityId: primary,
            }),
          });
          if (!response.ok)
            throw Error(
              "Choose at least one speciality and a primary speciality, then try again.",
            );
          setNotice(
            "Specialities saved. Your account, profile details and booking history are preserved.",
          );
          router.refresh();
        } catch (e) {
          setNotice(
            e instanceof Error ? e.message : "Could not save specialities.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Your categories & specialities</h2>
      <p>
        Select everything you offer under this account. These are your own
        declarations and do not add verification badges.
      </p>
      {!selection.confirmedAt && (
        <p className="form-notice">
          Please confirm your actual specialities. We have not inferred them
          from your previous broad category.{" "}
          {selection.unclassifiedServices > 0
            ? `${selection.unclassifiedServices} existing services need a speciality; their current statuses are preserved. Edit each to confirm where it belongs.`
            : ""}
        </p>
      )}
      {selection.confirmedAt && selection.unclassifiedServices > 0 && (
        <p className="form-notice">
          {selection.unclassifiedServices} existing services still need a
          speciality. Edit each service to confirm it. Their prices and current
          statuses are preserved.
        </p>
      )}
      {catalog.categories.map((c) => (
        <fieldset key={c.id}>
          <legend>{c.name}</legend>
          <div className="taxonomy-choices">
            {catalog.specialities
              .filter((s) => s.category_id === c.id)
              .map((s) => (
                <label className="policy-check" key={s.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={(e) => {
                      setSelected(
                        e.target.checked
                          ? [...selected, s.id]
                          : selected.filter((id) => id !== s.id),
                      );
                      if (!e.target.checked && primary === s.id) setPrimary("");
                    }}
                  />
                  {s.name}
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      <label>
        Primary speciality
        <select
          required
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
        >
          <option value="">Choose your primary speciality</option>
          {catalog.specialities
            .filter((s) => selected.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      {paused > 0 && (
        <p role="alert">
          Saving will pause {paused} published service{paused === 1 ? "" : "s"}{" "}
          in removed specialities. Existing bookings and payments stay in your
          history. Re-add the speciality and publish its services when ready.
        </p>
      )}
      <button
        className="button"
        disabled={busy || !selected.length || !selected.includes(primary)}
      >
        {busy ? "Saving…" : "Save specialities"}
      </button>
      <p role="status">{notice}</p>
    </form>
  );
}
