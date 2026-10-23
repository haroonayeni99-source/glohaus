"use client";

import "@/app/homepage-category-media.css";

import { TaxonomyFilters } from "./taxonomy-filters";
import type { TaxonomyCatalog } from "@/modules/taxonomy/domain";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requireAdminResponse } from "@/lib/admin-response";
import { readImageFile } from "@/lib/image-file";
import {
  homepageCategorySlots,
  type HomepageCategoryMetadata,type HomepageCategorySlot,
  categoryImage,
  categoryName,
  type HomepageCategoryNames,
  type HomepageCategoryImages,
  type HomepageImageDevice,
} from "@/modules/platform/homepage-images";

export function HomepageCategoryMediaControl({
  initial = {},
  initialNames = {},initialMetadata={},taxonomy,
}: {
  taxonomy?:TaxonomyCatalog;initialMetadata?:HomepageCategoryMetadata;
  initial?: HomepageCategoryImages;
  initialNames?: HomepageCategoryNames;
}) {
  const router = useRouter();
  const [images, setImages] = useState<HomepageCategoryImages>({
    desktop: { ...initial.desktop },
    mobile: { ...initial.mobile },
  });
  const [names, setNames] = useState<HomepageCategoryNames>({
    desktop: { ...initialNames.desktop },
    mobile: { ...initialNames.mobile },
  });
  const [metadata,setMetadata]=useState<HomepageCategoryMetadata>({desktop:{...initialMetadata.desktop},mobile:{...initialMetadata.mobile}});
  function changeMetadata(key:string,patch:Partial<HomepageCategorySlot>){setMetadata(current=>({...current,[device]:{...current[device],[key]:{categoryId:null,specialityId:null,templateId:null,description:"",sortOrder:homepageCategorySlots({categoryMetadata:current,categoryNames:names,categoryImages:images},device,true).findIndex(s=>s.key===key)*10,visible:true,...current[device]?.[key],...patch}}}));}
  const [device, setDevice] = useState<HomepageImageDevice>("mobile");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function change(key: string, value: string | null) {
    setImages((current) => ({
      ...current,
      [device]: { ...current[device], [key]: value },
    }));
    setNotice(
      "Preview updated. Save category changes to publish your changes.",
    );
  }

  async function choose(file: File | undefined, key: string, label: string) {
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      const image = await readImageFile(file);
      const response = await fetch("/api/v1/admin/homepage-media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: image.split(",")[1],
          altText: `${device} ${label} category image`,
        }),
      });
      await requireAdminResponse(
        response,
        "Image could not be uploaded. Try a valid image up to 20 MB.",
      );
      const data = await response.json();
      change(key, data.url);
      if (!reason.trim()) setReason("Refresh homepage category imagery");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/homepage-media/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, names, reason,...(taxonomy?{metadata}: {}) }),
      });
      await requireAdminResponse(
        response,
        "Category changes could not be saved. Your preview is kept so you can retry.",
      );
      setNotice(
        "Category names and images saved. They are now published on the homepage.",
      );
      setReason("");
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Category changes could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor-form owner-category-media" onSubmit={save}>
      <h3>Manage homepage category thumbnails</h3>
      <p className="lead">
        Choose a photo, check its circular preview, then save. Close-ups of
        finished nails, hair or the relevant body area work well. Desktop and
        mobile have separate names and images. On iPhone, customers can swipe through all visible thumbnails.
      </p>
      <label>
        Category settings for
        <select
          value={device}
          disabled={busy}
          onChange={(event) => {
            setDevice(event.target.value as HomepageImageDevice);
            setNotice("");
          }}
        >
          <option value="desktop">Desktop homepage</option>
          <option value="mobile">Mobile homepage</option>
        </select>
      </label>
      <p className="muted">
        Edit a name beside its photo. Link each shortcut to its category, speciality or service. A shortcut with no link searches for its saved name. Manage the marketplace category list in Categories.
      </p>
      <div className="owner-category-media-grid">
        {homepageCategorySlots({categoryMetadata:metadata,categoryNames:names,categoryImages:images},device,true).map((slot) => {
          const value =
            (images[device] as Record<string, string | null>)[slot.key] ?? "";
          const valid = !value || /^https:\/\//.test(value);
          return (
            <div
              className="owner-category-media-card"
              key={`${device}-${slot.key}`}
            >
              <div className="owner-category-media-title">
                <Image
                  src={valid ? categoryImage(images, device, slot) : slot.image}
                  alt={`${device === "desktop" ? "Desktop" : "Mobile"} ${slot.label} category preview`}
                  width={100}
                  height={100}
                  unoptimized
                />
                <h4>{categoryName(names, device, slot)}</h4>
              </div>
              <label>
                Category name
                <input
                  aria-label={`${device} ${slot.label} category name`}
                  disabled={busy}
                  required
                  minLength={2}
                  maxLength={60}
                  value={
                    (names[device] as Record<string, string | null>)[
                      slot.key
                    ] ?? slot.label
                  }
                  onChange={(event) => {
                    setNames((current) => ({
                      ...current,
                      [device]: {
                        ...current[device],
                        [slot.key]: event.target.value,
                      },
                    }));
                    setNotice(
                      "Preview updated. Save category changes to publish your changes.",
                    );
                    if (!reason.trim())
                      setReason("Update homepage category names");
                  }}
                />
              </label>
              {taxonomy&&<><TaxonomyFilters catalog={taxonomy} categoryId={metadata[device]?.[slot.key]?.categoryId??""} specialityId={metadata[device]?.[slot.key]?.specialityId??""} templateId={metadata[device]?.[slot.key]?.templateId??""} onChange={v=>changeMetadata(slot.key,{categoryId:v.categoryId||null,specialityId:v.specialityId||null,templateId:v.templateId||null})}/><label>Description<input maxLength={200} value={metadata[device]?.[slot.key]?.description??""} onChange={e=>changeMetadata(slot.key,{description:e.target.value})}/></label><label>Display order<input type="number" min={0} max={10000} value={slot.sortOrder} onChange={e=>changeMetadata(slot.key,{sortOrder:Number(e.target.value)})}/></label><label className="policy-check"><input type="checkbox" checked={metadata[device]?.[slot.key]?.visible!==false} onChange={e=>changeMetadata(slot.key,{visible:e.target.checked})}/>Show on homepage</label></>}
              <label>
                {slot.label} image
                <input
                  type="file"
                  aria-label={`${device} ${slot.label} category image`}
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void choose(file, slot.key, slot.label);
                  }}
                />
              </label>
              <small>
                JPEG, PNG or WebP · up to 20 MB. A square photo works best.
              </small>
              <details className="image-url-option">
                <summary>Or use an image link</summary>
                <label>
                  {slot.label} image URL
                  <input
                    type="url"
                    aria-label={`${device} ${slot.label} category image URL`}
                    inputMode="url"
                    placeholder="https://..."
                    disabled={busy}
                    maxLength={2048}
                    value={value}
                    onChange={(event) =>
                      change(slot.key, event.target.value.trim() || null)
                    }
                  />
                </label>
              </details>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  change(slot.key, null);
                  setNames((current) => ({
                    ...current,
                    [device]: { ...current[device], [slot.key]: null },
                  }));
                  if (!reason.trim())
                    setReason(
                      `Restore ${device} ${slot.label} category default`,
                    );
                }}
              >
                Use default for {slot.label}
              </button>
            </div>
          );
        })}
      </div>
      {taxonomy && (
        <div className="owner-homepage-add-category">
          <p className="muted">Need another thumbnail? Add it here, choose the category name, image and destination, then save. You can reorder or hide thumbnails at any time. Mobile and desktop can be managed separately.</p>
          <button
            type="button"
            disabled={busy || homepageCategorySlots({categoryMetadata:metadata,categoryNames:names,categoryImages:images},device,true).length >= 30}
            onClick={() => {
              const currentSlots = homepageCategorySlots({categoryMetadata:metadata,categoryNames:names,categoryImages:images},device,true);
              const nextOrder = Math.min(10000, Math.max(0,...currentSlots.map(slot => slot.sortOrder)) + 10);
              const key = crypto.randomUUID();
              changeMetadata(key,{sortOrder:nextOrder,categoryId:null});
              setNames(current=>({...current,[device]:{...current[device],[key]:"New category"}}));
              setReason(current => current.trim() || `Add ${device} homepage category thumbnail`);
              setNotice("New category added to your draft. Enter its name, choose an image and save to publish.");
            }}
          >
            + Add another category thumbnail
          </button>
        </div>
      )}
      <small>
        Choose images you have permission to use. Uploads stay private until you
        save.
      </small>
      <label>
        Reason for category change
        <input
          disabled={busy}
          required
          minLength={5}
          maxLength={500}
          value={reason}
          placeholder="e.g. Refresh category names and photos"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="editor-actions">
        <button className="button" disabled={busy || reason.trim().length < 5}>
          {busy ? "Saving…" : "Save category changes"}
        </button>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
