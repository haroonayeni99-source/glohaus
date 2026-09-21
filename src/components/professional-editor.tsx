"use client";
import { useLabels } from "./platform-labels";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  categories,
  money,
  profileSchema,
  serviceSchema,
  type ProfileInput,
  type Service,
} from "@/modules/professionals/domain";
export function ProfessionalEditor({
  initial,
  services,
  assets = [],
}: {
  initial: ProfileInput;
  services: Service[];
  assets?: { id: string; alt_text: string }[];
}) {
  const labels = useLabels();
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  async function send(url: string, body: unknown, method: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.code === "SLUG_UNAVAILABLE"
            ? "That profile address is already taken. Choose another."
            : "Could not save. Check your details and try again.",
        );
      setNotice("Saved successfully.");
      router.refresh();
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="form-notice" role="status">
        {notice ||
          "Your profile is private until you choose Published. Only your business details appear publicly."}
      </p>
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const parsed = profileSchema.safeParse(Object.fromEntries(data));
          if (!parsed.success) {
            setNotice(parsed.error.issues[0].message);
            return;
          }
          await send("/api/v1/professional/profile", parsed.data, "PUT");
        }}
      >
        <h2>Make it yours.</h2>
        <div className="field-grid">
          <label>
            Business / display name
            <input
              name="businessName"
              required
              minLength={2}
              maxLength={100}
              defaultValue={initial.businessName}
            />
          </label>
          <label>
            Profile address
            <input
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9-]{2,59}"
              defaultValue={initial.slug}
            />
            <small>
              GLOHAUS / p / your-name · lowercase letters, numbers and hyphens
            </small>
          </label>
          <label>
            City
            <input
              name="city"
              required
              minLength={2}
              maxLength={80}
              defaultValue={initial.city}
            />
            <small>Your public city, not your private home address.</small>
          </label>
          <label>
            Speciality
            <select name="category" defaultValue={initial.category}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {labels[category]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Short bio
          <textarea
            name="bio"
            required
            minLength={20}
            maxLength={600}
            defaultValue={initial.bio}
          />
        </label>
        <label>
          Business description
          <textarea
            name="businessDescription"
            maxLength={3000}
            rows={6}
            defaultValue={initial.businessDescription ?? ""}
          />
          <small>
            Tell clients about your experience, approach and the atmosphere of
            your business.
          </small>
        </label>
        <label>
          Public location details
          <input
            name="locationDetails"
            maxLength={180}
            defaultValue={initial.locationDetails ?? ""}
          />
          <small>
            Optional neighbourhood or public studio address. Do not include an
            address you want to keep private.
          </small>
        </label>
        <h3>How clients can reach you</h3>
        <p>
          Only the email or phone number selected as your preferred contact
          method appears publicly. Your sign-in email stays private. Social
          links you add are public.
        </p>
        <div className="field-grid">
          <label>
            Preferred contact method
            <select
              name="contactPreference"
              defaultValue={initial.contactPreference ?? "booking"}
            >
              <option value="booking">Book through GLOHAUS</option>
              <option value="email">Business email</option>
              <option value="phone">Business phone</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label>
            Business contact email
            <input
              name="contactEmail"
              type="email"
              maxLength={254}
              defaultValue={initial.contactEmail ?? ""}
            />
          </label>
          <label>
            Business contact phone
            <input
              name="contactPhone"
              type="tel"
              maxLength={25}
              defaultValue={initial.contactPhone ?? ""}
            />
          </label>
          <label>
            Instagram link
            <input
              name="instagramUrl"
              type="url"
              maxLength={500}
              placeholder="https://www.instagram.com/yourstudio"
              defaultValue={initial.instagramUrl ?? ""}
            />
          </label>
          <label>
            TikTok link
            <input
              name="tiktokUrl"
              type="url"
              maxLength={500}
              placeholder="https://www.tiktok.com/@yourstudio"
              defaultValue={initial.tiktokUrl ?? ""}
            />
          </label>
          <label>
            Website
            <input
              name="websiteUrl"
              type="url"
              maxLength={500}
              placeholder="https://yourstudio.co.uk"
              defaultValue={initial.websiteUrl ?? ""}
            />
          </label>
        </div>
        <label>
          Profile visibility
          <select
            name="publicationStatus"
            defaultValue={initial.publicationStatus}
          >
            <option value="draft">Draft — only you can see it</option>
            <option value="published">Published — visible to everyone</option>
            <option value="hidden">Hidden — temporarily off discovery</option>
          </select>
        </label>
        <div className="editor-actions">
          <button className="button" disabled={busy}>
            Save profile
          </button>
          {initial.publicationStatus === "published" && (
            <Link className="text-link" href={`/p/${initial.slug}`}>
              View public page
            </Link>
          )}
        </div>
      </form>
      <section className="service-edit-list" aria-label="Your services">
        {services.map((service) => (
          <article key={service.id} className="service-edit-row">
            <div>
              <h3>
                {service.name}
                {service.active === false ? " · Inactive" : ""}
              </h3>
              <p>
                {service.duration_minutes} minutes ·{" "}
                {money(service.price_pence)} · {money(service.deposit_pence)}{" "}
                deposit
              </p>
            </div>
            <button
              onClick={() => {
                setEditing(service);
                setNotice("Edit the service using the form below.");
              }}
            >
              Edit
            </button>
            {service.active !== false && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch(
                      `/api/v1/professional/services/${service.id}`,
                      {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                      },
                    );
                    if (!response.ok)
                      throw new Error("Could not deactivate service.");
                    if (editing?.id === service.id) setEditing(null);
                    setNotice(
                      "Service deactivated. Existing bookings are preserved.",
                    );
                    router.refresh();
                  } catch {
                    setNotice(
                      "Could not deactivate service. Please try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Deactivate
              </button>
            )}
          </article>
        ))}
      </section>
      <form
        key={editing?.id || "new"}
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const parsed = serviceSchema.safeParse({
            name: data.get("name"),
            description: data.get("description"),
            durationMinutes: Number(data.get("durationMinutes")),
            pricePence: Math.round(Number(data.get("price")) * 100),
            depositPence: Math.round(Number(data.get("deposit")) * 100),
            active: data.get("active") === "true",
            assetId: data.get("assetId") || null,
          });
          if (!parsed.success) {
            setNotice(parsed.error.issues[0].message);
            return;
          }
          if (
            await send(
              `/api/v1/professional/services${editing ? `/${editing.id}` : ""}`,
              parsed.data,
              editing ? "PUT" : "POST",
            )
          ) {
            setEditing(null);
            form.reset();
          }
        }}
      >
        <h2>{editing ? "Edit service" : "Add a service"}</h2>
        <label>
          Optional service image
          <select name="assetId" defaultValue={editing?.asset_id || ""}>
            <option value="">No image</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.alt_text}
              </option>
            ))}
          </select>
        </label>
        <p>
          Choose a portfolio image. Publish it in your portfolio to show it on
          your public service menu.{" "}
          <Link href="/professional/portfolio">Upload or manage images →</Link>
        </p>
        <label>
          Service name
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={editing?.name}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            maxLength={500}
            defaultValue={editing?.description}
          />
        </label>
        <div className="field-grid">
          <label>
            Duration (minutes)
            <input
              name="durationMinutes"
              type="number"
              min={15}
              max={480}
              step={5}
              required
              defaultValue={editing?.duration_minutes || 60}
            />
          </label>
          <label>
            Price (£)
            <input
              name="price"
              type="number"
              min={1}
              max={10000}
              step="0.01"
              required
              defaultValue={editing ? editing.price_pence / 100 : undefined}
            />
          </label>
          <label>
            Deposit (£)
            <input
              name="deposit"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={editing ? editing.deposit_pence / 100 : 0}
            />
          </label>
          <label>
            Availability in your menu
            <select
              name="active"
              defaultValue={editing?.active === false ? "false" : "true"}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </div>
        <div className="editor-actions">
          <button className="button" disabled={busy}>
            {editing ? "Save service" : "Add service"}
          </button>
          {editing && (
            <button
              type="button"
              className="text-link"
              onClick={() => setEditing(null)}
            >
              Cancel editing
            </button>
          )}
        </div>
      </form>
    </>
  );
}
