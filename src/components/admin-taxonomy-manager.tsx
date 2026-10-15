"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  taxonomyAdminSchema,
  type TaxonomyCatalog,
} from "@/modules/taxonomy/domain";
export type TaxonomyOverview = TaxonomyCatalog & {
  categoryCoverage?: {
    category_id: string;
    published_services: number;
    professionals: number;
    searches: number;
  }[];
  coverage: {
    speciality_id: string;
    published_services: number;
    professionals: number;
    searches: number;
  }[];
  services: {
    id: string;
    name: string;
    business_name: string;
    speciality_id: string | null;
    categorisation_status: string;
    categorisation_reason: string;
  }[];
};
export function AdminTaxonomyManager({ data }: { data: TaxonomyOverview }) {
  const router = useRouter();
  const [kind, setKind] = useState<"category" | "speciality" | "template">(
    "category",
  );
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const records =
    kind === "category"
      ? data.categories
      : kind === "speciality"
        ? data.specialities
        : data.templates;
  const selected = records.find((x) => x.id === editing);
  async function save(input: unknown) {
    const parsed = taxonomyAdminSchema.safeParse(input);
    if (!parsed.success) {
      setNotice(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/taxonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok)
        throw Error(
          "Could not save. Check relationships and unique names, slugs and synonyms. Your Admin verification may need refreshing.",
        );
      setNotice(
        "Catalogue updated and recorded in the audit log. Booking history is preserved.",
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="taxonomy-admin">
      <p>
        Manage broad categories, their specialities and service templates.
        Disable definitions to retire them; historical bookings retain their
        original labels and prices.
      </p>
      <div className="field-grid">
        <label>
          Definition type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setEditing("");
            }}
          >
            <option value="category">Categories</option>
            <option value="speciality">Specialities</option>
            <option value="template">Service templates</option>
          </select>
        </label>
        <label>
          Edit definition
          <select value={editing} onChange={(e) => setEditing(e.target.value)}>
            <option value="">Add new {kind}</option>
            {records.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.active ? "" : " · Disabled"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form
        className="editor-form"
        key={`${kind}:${editing}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const common = {
            operation: kind,
            id: editing || null,
            name: f.get("name"),
            slug: f.get("slug"),
            description: f.get("description"),
            active: f.get("active") === "true",
            sortOrder: Number(f.get("sortOrder")),
            aliases: String(f.get("aliases") || "")
              .split("\n")
              .map((t) => t.trim())
              .filter(Boolean),
            reason: f.get("reason"),
          };
          void save({
            ...common,
            ...(kind === "category"
              ? { imageUrl: f.get("imageUrl") || null }
              : kind === "speciality"
                ? { categoryId: f.get("categoryId") }
                : {
                    specialityId: f.get("specialityId"),
                    suggestedDurationMinutes: f.get("suggestedDurationMinutes")
                      ? Number(f.get("suggestedDurationMinutes"))
                      : null,
                  }),
          });
        }}
      >
        <h3>
          {editing ? "Edit" : "Add"} {kind}
        </h3>
        {kind === "speciality" && (
          <label>
            Category
            <select
              name="categoryId"
              required
              defaultValue={
                selected && "category_id" in selected
                  ? selected.category_id
                  : ""
              }
            >
              <option value="">Choose category</option>
              {data.categories
                .filter((c) => !c.legacy_only)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <small>
              Moving a speciality updates its services and professional category
              links together.
            </small>
          </label>
        )}
        {kind === "template" && (
          <label>
            Speciality
            <select
              name="specialityId"
              required
              defaultValue={
                selected && "speciality_id" in selected
                  ? selected.speciality_id
                  : ""
              }
            >
              <option value="">Choose speciality</option>
              {data.specialities
                .filter((s) => !s.merged_into_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="field-grid">
          <label>
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={
                kind === "category" ? 60 : kind === "speciality" ? 80 : 100
              }
              defaultValue={selected?.name ?? ""}
            />
          </label>
          <label>
            Stable URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={100}
              defaultValue={selected?.slug ?? ""}
            />
          </label>
          <label>
            Display order
            <input
              type="number"
              name="sortOrder"
              required
              min={0}
              max={10000}
              defaultValue={selected?.sort_order ?? 100}
            />
          </label>
          <label>
            Status
            <select
              name="active"
              defaultValue={selected?.active === false ? "false" : "true"}
            >
              <option value="true">Active</option>
              <option value="false">Disabled</option>
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            maxLength={kind === "template" ? 500 : 1000}
            defaultValue={selected?.description ?? ""}
          />
        </label>
        {kind === "category" && (
          <label>
            Category image URL
            <input
              name="imageUrl"
              type="url"
              pattern="https://.*"
              maxLength={2048}
              defaultValue={
                selected && "image_url" in selected
                  ? (selected.image_url ?? "")
                  : ""
              }
            />
          </label>
        )}
        {kind === "template" && (
          <label>
            Suggested duration (minutes)
            <input
              type="number"
              name="suggestedDurationMinutes"
              min={15}
              max={480}
              step={5}
              defaultValue={
                selected && "suggested_duration_minutes" in selected
                  ? (selected.suggested_duration_minutes ?? "")
                  : ""
              }
            />
          </label>
        )}
        <label>
          Alternative spellings & search synonyms (one per line)
          <textarea
            name="aliases"
            rows={4}
            defaultValue={data.aliases
              .filter((a) => a.target_kind === kind && a.target_id === editing)
              .map((a) => a.term)
              .join("\n")}
          />
        </label>
        <label>
          Reason for audit log
          <input name="reason" required minLength={5} maxLength={500} />
        </label>
        <button className="button" disabled={busy}>
          Save {kind}
        </button>
      </form>
      <details>
        <summary>Merge specialities safely</summary>
        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              operation: "merge",
              sourceId: f.get("sourceId"),
              targetId: f.get("targetId"),
              reason: f.get("reason"),
            });
          }}
        >
          <p>
            The source is retired. Its services, content, templates and selected
            professionals move to the destination. Booking and payment snapshots
            stay unchanged.
          </p>
          {["sourceId", "targetId"].map((name, i) => (
            <label key={name}>
              {i ? "Destination" : "Source to retire"}
              <select name={name} required>
                <option value="">Choose speciality</option>
                {data.specialities
                  .filter((s) => !s.merged_into_id && (i === 0 || s.active))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label>
            Reason
            <input name="reason" required minLength={5} maxLength={500} />
          </label>
          <button className="button" disabled={busy}>
            Merge specialities
          </button>
        </form>
      </details>
      <details>
        <summary>Review service categorisation</summary>
        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              operation: "review",
              serviceId: f.get("serviceId"),
              status: f.get("status"),
              reason: f.get("reason"),
            });
          }}
        >
          <label>
            Service
            <select name="serviceId" required>
              <option value="">Choose service</option>
              {data.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.business_name} · {s.categorisation_status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Decision
            <select name="status">
              <option value="needs_review">
                Needs review — hidden from service discovery
              </option>
              <option value="blocked">
                Blocked — unavailable for new bookings
              </option>
              <option value="approved">Approved</option>
            </select>
          </label>
          <label>
            Reason
            <input name="reason" required minLength={5} maxLength={500} />
          </label>
          <button className="button" disabled={busy}>
            Save categorisation decision
          </button>
        </form>
      </details>
      <h3>Demand & professional coverage</h3>
      {data.categoryCoverage && (
        <div className="taxonomy-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Published services</th>
                <th>Professionals</th>
                <th>Searches · last 30 days</th>
              </tr>
            </thead>
            <tbody>
              {data.categoryCoverage.map((c) => (
                <tr key={c.category_id}>
                  <td>
                    {data.categories.find((x) => x.id === c.category_id)?.name}
                  </td>
                  <td>{c.published_services}</td>
                  <td>{c.professionals}</td>
                  <td>{c.searches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="taxonomy-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Speciality</th>
              <th>Published services</th>
              <th>Professionals</th>
              <th>Searches · last 30 days</th>
            </tr>
          </thead>
          <tbody>
            {data.specialities.map((s) => {
              const coverage = data.coverage.find(
                (c) => c.speciality_id === s.id,
              );
              return (
                <tr key={s.id}>
                  <td>
                    {data.categories.find((c) => c.id === s.category_id)?.name}
                  </td>
                  <td>
                    {s.name}
                    {s.active ? "" : " · Disabled"}
                  </td>
                  <td>{coverage?.published_services ?? 0}</td>
                  <td>{coverage?.professionals ?? 0}</td>
                  <td>{coverage?.searches ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="status">{notice}</p>
    </div>
  );
}
