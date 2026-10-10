"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Eye, EyeOff, Pencil, Plus, Search, Tags } from "lucide-react";
import { requireAdminResponse } from "@/lib/admin-response";
import type { AdminCategory } from "@/modules/admin/repository";

type Draft = { id: string | null; name: string; slug: string; active: boolean; sortOrder: number; reason: string };
type Filter = "all" | "visible" | "hidden";

function slugify(value: string) {
  return value.toLowerCase().trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function AdminCategoryManager({ initial }: { initial: AdminCategory[] }) {
  const router = useRouter();
  const helpId = useId();
  const [snapshot, setSnapshot] = useState(initial);
  const [categories, setCategories] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const editorKey = draft ? draft.id ?? "new" : null;

  // Keep immediate saved feedback, then reconcile with refreshed server data.
  if (initial !== snapshot) { setSnapshot(initial); setCategories(initial); }

  useEffect(() => {
    if (editorKey === null) return;
    nameRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [editorKey]);

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const visibleCount = categories.filter(category => category.active).length;
  const matching = sorted.filter(category => category.name.toLowerCase().includes(query.trim().toLowerCase())
    && (filter === "all" || category.active === (filter === "visible")));

  function open(category?: AdminCategory) {
    setError(""); setNotice("");
    setDraft(category ? { id: category.id, name: category.name, slug: category.slug, active: category.active, sortOrder: category.sort_order, reason: "" }
      : { id: null, name: "", slug: "", active: true, sortOrder: Math.min(10000, Math.max(0, ...categories.map(item => item.sort_order)) + 10), reason: "" });
  }

  function close() {
    setDraft(null); setError("");
    requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
  }

  async function save(data: Draft, closeEditor: boolean) {
    if (busy) return;
    setError(""); setNotice("");
    const name = data.name.trim();
    const slug = (data.slug || slugify(name)).trim();
    const duplicate = categories.find(category => category.id !== data.id
      && (category.name.toLowerCase() === name.toLowerCase() || category.slug === slug));
    if (duplicate) { setError(`“${duplicate.name}” already exists. Edit that category or choose a different name and link.`); return; }
    if (name.length < 2 || name.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      || !Number.isInteger(data.sortOrder) || data.sortOrder < 0 || data.sortOrder > 10000) {
      setError("Enter a category name with 2–60 characters. Check the category link and display order in Advanced options."); return;
    }
    const reason = data.reason.trim() || `${data.id ? "Update" : "Add"} category: ${name}`;
    if (reason.length < 5) { setError("Add a change note with at least 5 characters, or leave it blank to use the automatic note."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, name, slug, reason }),
      });
      await requireAdminResponse(response, "Category change could not be saved. Your changes are still here; please retry.");
      const result = await response.json() as { id: string };
      const saved = { id: data.id ?? result.id, name, slug, active: data.active, sort_order: data.sortOrder };
      setCategories(current => [...current.filter(category => category.id !== saved.id), saved]);
      setNotice(closeEditor ? (data.id ? `“${name}” updated.` : `“${name}” added.`)
        : `“${name}” is now ${data.active ? "visible" : "hidden"}.`);
      if (closeEditor) {
        close(); setQuery(""); setFilter("all");
      }
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save category. Please retry."); }
    finally { setBusy(false); }
  }

  return (
    <div className="category-manager">
      <div className="category-toolbar">
        <div className="category-summary"><span><strong>{visibleCount}</strong> visible</span><span><strong>{categories.length - visibleCount}</strong> hidden</span></div>
        <button ref={addRef} className="category-primary" type="button" disabled={busy || draft !== null} onClick={() => open()}><Plus size={17} aria-hidden /> Add category</button>
      </div>
      {notice && <p className="category-feedback category-success" role="status"><Check size={17} aria-hidden />{notice}</p>}
      {error && !draft && <p className="category-feedback category-error" role="alert">{error}</p>}

      {draft && <form ref={formRef} className="category-composer" aria-label={draft.id ? "Edit category" : "New category"}
        onSubmit={event => { event.preventDefault(); void save(draft, true); }}>
        <div className="category-composer-heading"><span className="category-icon"><Tags size={20} aria-hidden /></span><div><h3>{draft.id ? "Edit category" : "Create a category"}</h3><p>A clear name helps people find the right services.</p></div></div>
        {error && <p className="category-feedback category-error" role="alert">{error}</p>}
        <label className="category-field">Category name<input ref={nameRef} name="name" value={draft.name} placeholder="For example, Massage therapy" minLength={2} maxLength={60} required disabled={busy}
          onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="category-visibility"><input name="active" type="checkbox" aria-label="Show on the website" aria-describedby={`${helpId}-visibility`} checked={draft.active} disabled={busy} onChange={event => setDraft({ ...draft, active: event.target.checked })} />
          <span><strong>Show on the website</strong><small id={`${helpId}-visibility`}>{draft.active ? "People can find this category when browsing services." : "Keep this category hidden until you are ready."}</small></span>
        </label>
        <details className="category-advanced"><summary>Advanced options<ChevronDown size={16} aria-hidden /></summary>
          <div className="category-advanced-fields">
            <label className="category-field">Category link<input name="slug" aria-label="Category link" aria-describedby={`${helpId}-link`} value={draft.slug || (draft.id ? "" : slugify(draft.name))} disabled={busy} placeholder="Generated from the category name" pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              onChange={event => setDraft({ ...draft, slug: event.target.value })} /><small id={`${helpId}-link`}>Use lowercase letters, numbers and hyphens. Existing links stay the same when you rename a category.</small></label>
            <label className="category-field">Display order<input name="sortOrder" aria-label="Display order" aria-describedby={`${helpId}-order`} type="number" min={0} max={10000} step={1} value={Number.isNaN(draft.sortOrder) ? "" : draft.sortOrder} required disabled={busy}
              onChange={event => setDraft({ ...draft, sortOrder: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /><small id={`${helpId}-order`}>Lower numbers appear first. Categories with the same number are sorted by name.</small></label>
            <label className="category-field">Change note (optional)<input name="reason" value={draft.reason} maxLength={500} disabled={busy} placeholder="We add a note automatically if you leave this blank"
              onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
          </div>
        </details>
        <div className="category-form-actions"><button className="category-primary" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create category"}</button><button className="category-secondary" type="button" disabled={busy} onClick={close}>Cancel</button></div>
      </form>}

      <div className="category-list-toolbar">
        <label className="category-search"><Search size={17} aria-hidden /><input aria-label="Search categories" type="search" placeholder="Search categories" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="category-filters" role="group" aria-label="Filter categories">
          {([ ["all", "All"], ["visible", "Visible"], ["hidden", "Hidden"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>
      <p className="category-results" role="status">{matching.length} {matching.length === 1 ? "category" : "categories"}{filter === "all" && !query.trim() ? "" : " found"}</p>
      <div className="category-list">
        {matching.map(category => <article className="category-row" key={category.id}>
          <span className="category-icon"><Tags size={19} aria-hidden /></span>
          <div className="category-row-copy"><h3>{category.name}</h3><span className={`category-badge${category.active ? " is-visible" : ""}`}>{category.active ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}{category.active ? "Visible" : "Hidden"}</span></div>
          <div className="category-row-actions"><button className="category-secondary" type="button" aria-label={`Edit ${category.name}`} disabled={busy || draft !== null} onClick={() => open(category)}><Pencil size={15} aria-hidden />Edit</button>
            <button className="category-secondary" type="button" aria-label={`${category.active ? "Hide" : "Show"} ${category.name}`} disabled={busy || draft !== null}
              onClick={() => void save({ id: category.id, name: category.name, slug: category.slug, active: !category.active, sortOrder: category.sort_order,
                reason: category.active ? "Hide category from GLOHAUS" : "Restore category to GLOHAUS" }, false)}>{category.active ? "Hide" : "Show"}</button></div>
        </article>)}
      </div>
      {!matching.length && <div className="category-empty"><Tags size={28} aria-hidden /><h3>{categories.length ? "No matching categories" : "Your categories start here"}</h3><p>{categories.length ? "Try a different name or show all categories." : "Add your first category to help people find beauty services."}</p>
        {categories.length > 0 && <button className="category-secondary" type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>}
      </div>}
    </div>
  );
}
