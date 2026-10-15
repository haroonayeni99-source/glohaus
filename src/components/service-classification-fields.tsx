"use client";
import { useState } from "react";
import type { Service } from "@/modules/professionals/domain";
import type {
  TaxonomyCatalog,
  ProfessionalSelection,
  ServiceOptionInput,
} from "@/modules/taxonomy/domain";
export function ServiceClassificationFields({
  catalog,
  selection,
  service,
}: {
  catalog: TaxonomyCatalog;
  selection: ProfessionalSelection;
  service: Service | null;
}) {
  const [category, setCategory] = useState(service?.category_id ?? "");
  const [speciality, setSpeciality] = useState(service?.speciality_id ?? "");
  const [template, setTemplate] = useState(service?.template_id ?? "");
  const available = catalog.specialities.filter((s) =>
    selection.specialityIds.includes(s.id),
  );
  return (
    <>
      <div className="field-grid">
        <label>
          Category
          <select
            name="categoryId"
            required
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSpeciality("");
              setTemplate("");
            }}
          >
            <option value="">Choose a category</option>
            {catalog.categories
              .filter((c) => available.some((s) => s.category_id === c.id))
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Speciality
          <select
            name="specialityId"
            required
            value={speciality}
            onChange={(e) => {
              setSpeciality(e.target.value);
              setTemplate("");
            }}
          >
            <option value="">Choose a speciality</option>
            {available
              .filter((s) => s.category_id === category)
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label>
        Service choice
        <select
          name="templateId"
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            const t = catalog.templates.find((t) => t.id === e.target.value);
            const form = e.currentTarget.form;
            if (t && form) {
              const name = form.elements.namedItem(
                "name",
              ) as HTMLInputElement | null;
              const duration = form.elements.namedItem(
                "durationMinutes",
              ) as HTMLInputElement | null;
              if (name) name.value = t.name;
              if (duration && t.suggested_duration_minutes)
                duration.value = String(t.suggested_duration_minutes);
            }
          }}
        >
          <option value="">Custom service within this speciality</option>
          {catalog.templates
            .filter((t) => t.speciality_id === speciality)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Service status
        <select
          name="publicationStatus"
          defaultValue={
            service?.publication_status ??
            (service?.active === false ? "inactive" : "published")
          }
        >
          <option value="published">
            Published — bookable on your published profile
          </option>
          <option value="draft">Draft — private</option>
          <option value="inactive">
            Inactive — unavailable for new bookings
          </option>
        </select>
      </label>
    </>
  );
}
export function ServiceOptionsEditor({ service }: { service: Service | null }) {
  const [options, setOptions] = useState<
    (ServiceOptionInput & { kind: "variation" | "extra" })[]
  >(
    (service?.options ?? []).map(
      ({
        id,
        name,
        pricePence,
        durationMinutes,
        active,
        sortOrder,
        attributes,
        kind,
      }) => ({
        id,
        name,
        pricePence,
        durationMinutes,
        active,
        sortOrder,
        attributes,
        kind,
      }),
    ),
  );
  function change(index: number, value: Partial<ServiceOptionInput>) {
    setOptions(options.map((o, i) => (i === index ? { ...o, ...value } : o)));
  }
  return (
    <fieldset>
      <legend>Variations & optional extras</legend>
      <p>
        Variations replace the base price and duration. Extras add to the
        selected price and duration. Every choice uses your shared calendar and
        existing GLOHAUS payment rules.
      </p>
      {(["variation", "extra"] as const).map((kind) => (
        <section key={kind}>
          <h3>
            {kind === "variation"
              ? "Sizes, lengths and styles"
              : "Optional extras"}
          </h3>
          {options.map((o, i) =>
            o.kind !== kind ? null : (
              <fieldset key={o.id ?? i}>
                <legend>{o.name || `New ${kind}`}</legend>
                <div className="field-grid">
                  <label>
                    Name
                    <input
                      required
                      minLength={2}
                      maxLength={80}
                      value={o.name}
                      onChange={(e) => change(i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    {kind === "variation"
                      ? "Price (£)"
                      : "Additional price (£)"}
                    <input
                      type="number"
                      required
                      min={kind === "variation" ? 1 : 0}
                      max={10000}
                      step="0.01"
                      value={o.pricePence / 100}
                      onChange={(e) =>
                        change(i, {
                          pricePence: Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </label>
                  <label>
                    {kind === "variation"
                      ? "Duration (minutes)"
                      : "Additional minutes"}
                    <input
                      type="number"
                      required
                      min={kind === "variation" ? 15 : 0}
                      max={480}
                      step={5}
                      value={o.durationMinutes}
                      onChange={(e) =>
                        change(i, { durationMinutes: Number(e.target.value) })
                      }
                    />
                  </label>
                  {kind === "variation" &&
                    ["Size", "Length", "Style"].map((a) => (
                      <label key={a}>
                        {a}
                        <input
                          maxLength={100}
                          value={o.attributes[a.toLowerCase()] ?? ""}
                          onChange={(e) =>
                            change(i, {
                              attributes: {
                                ...o.attributes,
                                [a.toLowerCase()]: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                </div>
                <label className="policy-check">
                  <input
                    type="checkbox"
                    checked={o.active}
                    onChange={(e) => change(i, { active: e.target.checked })}
                  />
                  Available for booking
                </label>
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, n) => n !== i))}
                >
                  Remove {kind}
                </button>
              </fieldset>
            ),
          )}
          <button
            type="button"
            disabled={
              options.filter((o) => o.kind === kind).length >=
              (kind === "variation" ? 20 : 10)
            }
            onClick={() =>
              setOptions([
                ...options,
                {
                  kind,
                  name: "",
                  pricePence:
                    kind === "variation" ? (service?.price_pence ?? 1000) : 0,
                  durationMinutes:
                    kind === "variation"
                      ? (service?.duration_minutes ?? 60)
                      : 0,
                  active: true,
                  sortOrder: options.length,
                  attributes: {},
                },
              ])
            }
          >
            Add {kind}
          </button>
          <input
            type="hidden"
            name={kind === "variation" ? "variations" : "extras"}
            value={JSON.stringify(
              options
                .filter((o) => o.kind === kind)
                .map(({ kind: ignored, ...o }) => {
                  void ignored;
                  return o;
                }),
            )}
          />
        </section>
      ))}
    </fieldset>
  );
}
