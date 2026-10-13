import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import { savePost, publicPost, publicPosts } from "@/modules/posts/repository";
import { createStory } from "@/modules/stories/repository";
const db = await createTestDatabase();
let owner: string;
let other: string;
function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
async function asset(type: "image" | "video" = "image", status = "draft") {
  const id = randomUUID();
  await asUser("media-owner", (sql) =>
    sql.query(
      "INSERT INTO beauty.portfolio_assets(id,professional_id,blob_path,alt_text,media_type,mime_type) VALUES($1,$2,$3,'Finished nails',$4,$5)",
      [
        id,
        owner,
        `portfolio/video-${id}.mp4`,
        type,
        type === "video" ? "video/mp4" : "image/webp",
      ],
    ),
  );
  if (status !== "draft")
    await asUser("media-owner", (sql) =>
      sql.query(
        "UPDATE beauty.portfolio_assets SET publication_status=$2 WHERE id=$1",
        [id, status],
      ),
    );
  return id;
}
const post = {
  title: "Finished nails",
  body: "A fresh set of nails from our studio today.",
  kind: "design" as const,
  publicationStatus: "published" as const,
  serviceId: null,
};
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["media-owner", "media-other"]) {
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: authId,
          secondFactorAge: null,
        },
        "professional",
      ),
    );
    if (authId === "media-owner") owner = account.professionalId!;
    else other = account.professionalId!;
  }
  await asUser("media-owner", (sql) =>
    updateProfile(sql, owner, {
      slug: "media-owner",
      businessName: "Media Studio",
      bio: "Beauty treatments from a London professional.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    }),
  );
});
afterAll(() => db.close());
it("keeps new photo attachments private while the post is a draft", async () => {
  const id = await asset();
  const saved = await asUser("media-owner", (sql) =>
    savePost(sql, owner, { ...post, publicationStatus: "draft", assetId: id }),
  );
  expect(
    await asUser("", (sql) => publicPost(sql, String(saved.id))),
  ).toBeUndefined();
  expect(
    (
      await db.query<{ publication_status: string }>(
        "SELECT publication_status FROM beauty.portfolio_assets WHERE id=$1",
        [id],
      )
    ).rows[0].publication_status,
  ).toBe("draft");
});
it("publishes a direct photo attachment with its Discover post", async () => {
  const id = await asset();
  const saved = await asUser("media-owner", (sql) =>
    savePost(sql, owner, { ...post, assetId: id }),
  );
  expect(
    await asUser("", (sql) => publicPost(sql, String(saved.id))),
  ).toMatchObject({ asset_id: id, asset_media_type: "image" });
});
it("preserves video type on the feed and a direct post link", async () => {
  const id = await asset("video");
  const saved = await asUser("media-owner", (sql) =>
    savePost(sql, owner, { ...post, assetId: id }),
  );
  expect(
    await asUser("", (sql) => publicPost(sql, String(saved.id))),
  ).toMatchObject({ asset_media_type: "video", asset_mime_type: "video/mp4" });
  expect(await asUser("", publicPosts)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ asset_id: id, asset_media_type: "video" }),
    ]),
  );
});
it.each(["image", "video"] as const)(
  "publishes a direct %s Story for 24 hours",
  async (type) => {
    const id = await asset(type);
    const story = await asUser("media-owner", (sql) =>
      createStory(sql, owner, {
        assetId: id,
        serviceId: null,
        caption: "Today's work",
      }),
    );
    const rows = (
      await asUser("", (sql) =>
        sql.query(
          "SELECT *,extract(epoch FROM expires_at-created_at)::int AS lifetime FROM beauty.public_stories WHERE id=$1",
          [story.id],
        ),
      )
    ).rows;
    expect(rows[0]).toMatchObject({
      asset_id: id,
      media_type: type,
      lifetime: 86400,
    });
    await db.query(
      "UPDATE beauty.professional_stories SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE id=$1",
      [story.id],
    );
    expect(
      (
        await asUser("", (sql) =>
          sql.query("SELECT id FROM beauty.public_stories WHERE id=$1", [
            story.id,
          ]),
        )
      ).rows,
    ).toHaveLength(0);
  },
);
it("cannot attach or publish another professional's draft media", async () => {
  const id = await asset();
  await expect(
    asUser("media-other", (sql) =>
      savePost(sql, other, { ...post, assetId: id }),
    ),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    asUser("media-other", (sql) =>
      createStory(sql, other, {
        assetId: id,
        serviceId: null,
        caption: "Not mine",
      }),
    ),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    (
      await db.query<{ publication_status: string }>(
        "SELECT publication_status FROM beauty.portfolio_assets WHERE id=$1",
        [id],
      )
    ).rows[0].publication_status,
  ).toBe("draft");
});
it("an invalid service does not expose an uploaded Story attachment", async () => {
  const id = await asset();
  await expect(
    asUser("media-owner", (sql) =>
      createStory(sql, owner, {
        assetId: id,
        serviceId: randomUUID(),
        caption: "Work",
      }),
    ),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    (
      await db.query<{ publication_status: string }>(
        "SELECT publication_status FROM beauty.portfolio_assets WHERE id=$1",
        [id],
      )
    ).rows[0].publication_status,
  ).toBe("draft");
});
it("does not republish hidden media", async () => {
  const id = await asset("image", "hidden");
  await expect(
    asUser("media-owner", (sql) =>
      createStory(sql, owner, {
        assetId: id,
        serviceId: null,
        caption: "Work",
      }),
    ),
  ).rejects.toThrow("FORBIDDEN");
  await asUser("media-owner", (sql) =>
    savePost(sql, owner, { ...post, assetId: id }),
  );
  expect(
    (
      await db.query<{ publication_status: string }>(
        "SELECT publication_status FROM beauty.portfolio_assets WHERE id=$1",
        [id],
      )
    ).rows[0].publication_status,
  ).toBe("hidden");
});
