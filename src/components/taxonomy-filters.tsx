"use client";
import { useState } from "react";
import type { TaxonomyCatalog } from "@/modules/taxonomy/domain";
export function TaxonomyFilters({
  catalog,
  categoryId = "",
  specialityId = "",
  templateId = "",
  onChange,
}: {
  catalog: TaxonomyCatalog;
  categoryId?: string;
  specialityId?: string;
  templateId?: string;
  onChange?: (selection: {
    categoryId: string;
    specialityId: string;
    templateId: string;
  }) => void;
}) {
  const initialSpeciality =
    specialityId ||
    catalog.templates.find((t) => t.id === templateId)?.speciality_id ||
    "";
  const initialCategory =
    categoryId ||
    catalog.specialities.find((s) => s.id === initialSpeciality)?.category_id ||
    "";
  const [category, setCategory] = useState(initialCategory);
  const [speciality, setSpeciality] = useState(initialSpeciality);
  const [template, setTemplate] = useState(templateId);
  return (
    <div className="field-grid taxonomy-filters">
      <label>
        Category
        <select
          aria-label="Category"
          name="categoryId"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSpeciality("");
            setTemplate("");
            onChange?.({
              categoryId: e.target.value,
              specialityId: "",
              templateId: "",
            });
          }}
        >
          <option value="">All categories</option>
          {catalog.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Speciality
        <select
          aria-label="Speciality"
          name="specialityId"
          value={speciality}
          onChange={(e) => {
            setSpeciality(e.target.value);
            setTemplate("");
            const c =
              catalog.specialities.find((s) => s.id === e.target.value)
                ?.category_id ?? category;
            setCategory(c);
            onChange?.({
              categoryId: c,
              specialityId: e.target.value,
              templateId: "",
            });
          }}
        >
          <option value="">All specialities</option>
          {catalog.specialities
            .filter((s) => !category || s.category_id === category)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Service
        <select
          aria-label="Service"
          name="templateId"
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            const spec =
              catalog.templates.find((t) => t.id === e.target.value)
                ?.speciality_id ?? speciality;
            const c =
              catalog.specialities.find((s) => s.id === spec)?.category_id ??
              category;
            setSpeciality(spec);
            setCategory(c);
            onChange?.({
              categoryId: c,
              specialityId: spec,
              templateId: e.target.value,
            });
          }}
        >
          <option value="">All services</option>
          {catalog.templates
            .filter((t) =>
              speciality
                ? t.speciality_id === speciality
                : !category ||
                  catalog.specialities.some(
                    (s) =>
                      s.id === t.speciality_id && s.category_id === category,
                  ),
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
