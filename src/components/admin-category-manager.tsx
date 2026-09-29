"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCategory } from "@/modules/admin/repository";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminCategoryManager({ initial }: { initial: AdminCategory[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(data: {
    id?: string | null;
    name: string;
    slug: string;
    active: boolean;
    sortOrder: number;
    reason: string;
  }) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Category change could not be saved.");
      setNotice(data.id ? "Category updated." : "Category added.");
      setEditing(null);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save category.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {notice && <p className="form-notice" role="status">{notice}</p>}

      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const name = String(form.get("name") || "").trim();
          const slug = String(form.get("slug") || "").trim() || slugify(name);
          void save({
            id: editing?.id ?? null,
            name,
            slug,
            active: form.get("active") === "on",
            sortOrder: Number(form.get("sortOrder") || 100),
            reason: String(form.get("reason") || ""),
          });
        }}
      >
        <h3>{editing ? "Edit category" : "Add a new category"}</h3>
        <div className="field-grid">
          <label>
            Category name
            <input name="name" defaultValue={editing?.name ?? ""} minLength={2} maxLength={60} required key={editing?.id ?? "new-name"} />
          </label>
          <label>
            URL slug
            <input name="slug" defaultValue={editing?.slug ?? ""} placeholder="e.g. massage-therapy" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" key={(editing?.id ?? "new") + "-slug"} />
          </label>
          <label>
            Display order
            <input name="sortOrder" type="number" min={0} max={10000} defaultValue={editing?.sort_order ?? 100} required key={(editing?.id ?? "new") + "-order"} />
          </label>
          <label>
            <input name="active" type="checkbox" defaultChecked={editing?.active ?? true} key={(editing?.id ?? "new") + "-active"} />
            Active and visible
          </label>
        </div>
        <label>
          Reason for this change
          <input name="reason" minLength={5} maxLength={500} required />
        </label>
        <div className="editor-actions">
          <button className="button" disabled={busy}>{editing ? "Save category" : "Add category"}</button>
          {editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}
        </div>
      </form>

      <div className="service-edit-list">
        {initial.map((category) => (
          <article className="service-edit-row" key={category.id}>
            <div>
              <h3>{category.name}</h3>
              <p>/{category.slug} · order {category.sort_order}</p>
              <small>{category.active ? "Active" : "Hidden"}</small>
            </div>
            <button type="button" onClick={() => setEditing(category)}>Edit</button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void save({
                  id: category.id,
                  name: category.name,
                  slug: category.slug,
                  active: !category.active,
                  sortOrder: category.sort_order,
                  reason: category.active ? "Hide category from GLOHAUS" : "Restore category to GLOHAUS",
                })
              }
            >
              {category.active ? "Hide" : "Activate"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
