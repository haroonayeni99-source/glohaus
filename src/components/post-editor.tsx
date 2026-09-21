"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postSchema, type OwnPost } from "@/modules/posts/domain";
import type { Service } from "@/modules/professionals/domain";
export function PostEditor({
  posts,
  services,
  assets,
}: {
  posts: OwnPost[];
  services: Service[];
  assets: { id: string; alt_text: string }[];
}) {
  const [editing, setEditing] = useState<OwnPost | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <p className="form-notice">
        Publish a design story or a written tutorial. Your professional profile
        must also be published for posts to appear in discovery. You can attach
        a published portfolio image. Video uploads are not available yet.
      </p>
      <div className="service-edit-list">
        {posts.map((post) => (
          <article className="service-edit-row" key={post.id}>
            <div>
              <h3>{post.title}</h3>
              <p>
                {post.kind} · {post.publication_status}
              </p>
            </div>
            <button onClick={() => setEditing(post)}>Edit</button>
          </article>
        ))}
      </div>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      <form
        className="editor-form"
        key={editing?.id || "new"}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const parsed = postSchema.safeParse({
            ...Object.fromEntries(data),
            serviceId: data.get("serviceId") || null,
            assetId: data.get("assetId") || null,
          });
          if (!parsed.success) {
            setNotice(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          try {
            const response = await fetch(
              `/api/v1/professional/posts${editing ? `/${editing.id}` : ""}`,
              {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed.data),
              },
            );
            if (!response.ok)
              throw new Error(
                "Could not save. Please check your details and try again.",
              );
            setNotice("Post saved.");
            setEditing(null);
            form.reset();
            router.refresh();
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not save.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{editing ? "Edit your post" : "Share a little inspiration."}</h2>
        <label>
          Title
          <input
            name="title"
            minLength={3}
            maxLength={120}
            required
            defaultValue={editing?.title}
          />
        </label>
        <label>
          Post type
          <select name="kind" defaultValue={editing?.kind || "design"}>
            <option value="design">Design story</option>
            <option value="tutorial">Written tutorial</option>
          </select>
        </label>
        <label>
          Your story or tutorial
          <textarea
            name="body"
            minLength={20}
            maxLength={1800}
            required
            defaultValue={editing?.body}
          />
        </label>
        <label>
          Link one of your services (optional)
          <select name="serviceId" defaultValue={editing?.service_id || ""}>
            <option value="">No service — just inspiration</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Portfolio image (optional)
          <select name="assetId" defaultValue={editing?.asset_id || ""}>
            <option value="">No image</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.alt_text}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visibility
          <select
            name="publicationStatus"
            defaultValue={editing?.publication_status || "draft"}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <div className="editor-actions">
          <button className="button" disabled={busy}>
            Save post
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </>
  );
}
