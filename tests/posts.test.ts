import { parsePostCursor, encodePostCursor } from "@/modules/posts/pagination";
import {
  saveEngagement,
  viewerEngagement,
  savedPosts,
} from "@/modules/engagement/repository";
import {
  readDeviceEngagement,
  engagementSchema,
} from "@/modules/engagement/domain";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import {
  savePost,
  publicPosts,
  publicPostPage,
} from "@/modules/posts/repository";
import { postSchema } from "@/modules/posts/domain";
const db = new PGlite();
let owner: string;
let other: string;
let service: string;
let postId: string;
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
const post = {
  title: "A simple finishing routine",
  body: "Start with clean tools. Work gently and follow the product instructions.",
  kind: "tutorial" as const,
  publicationStatus: "draft" as "draft" | "published",
  serviceId: null as string | null,
};
beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  for (const authId of ["alice", "bob"]) {
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
    if (authId === "alice") owner = account.professionalId!;
    else other = account.professionalId!;
  }
  await asUser("alice", (sql) =>
    updateProfile(sql, owner, {
      slug: "alice-studio",
      businessName: "Alice",
      bio: "An independent hair professional in London",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    }),
  );
  service = (
    await asUser("alice", (sql) =>
      saveService(sql, owner, {
        name: "Hair styling",
        description: "",
        durationMinutes: 60,
        pricePence: 5000,
        depositPence: 1000,
        active: true,
      }),
    )
  ).id as string;
});
afterAll(() => db.close());
describe.sequential("professional posts", () => {
  it("keeps drafts private", async () => {
    postId = (await asUser("alice", (sql) => savePost(sql, owner, post)))
      .id as string;
    expect(await asUser("", publicPosts)).toEqual([]);
  });
  it("publishes to anonymous feed with professional and service", async () => {
    await asUser("alice", (sql) =>
      savePost(
        sql,
        owner,
        { ...post, publicationStatus: "published", serviceId: service },
        postId,
      ),
    );
    const feed = await asUser("", publicPosts);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      title: post.title,
      business_name: "Alice",
      service_id: service,
      price_pence: 5000,
    });
    expect(feed[0]).not.toHaveProperty("email");
  });
  it("rejects tagging another professional's service", async () => {
    await expect(
      asUser("bob", (sql) =>
        savePost(sql, other, { ...post, serviceId: service }),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("cannot edit another professional's post", async () => {
    await expect(
      asUser("bob", (sql) => savePost(sql, other, post, postId)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("cannot bypass moderation through SQL", async () => {
    await expect(
      asUser("alice", (sql) =>
        sql.query(
          "UPDATE beauty.posts SET moderation_status='visible' WHERE id=$1",
          [postId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("moderation hides posts without deleting the author's record", async () => {
    await db.query(
      "UPDATE beauty.posts SET moderation_status='hidden' WHERE id=$1",
      [postId],
    );
    expect(await asUser("", publicPosts)).toEqual([]);
    expect(
      (await asUser("alice", (sql) => sql.query("SELECT id FROM beauty.posts")))
        .rows,
    ).toHaveLength(1);
  });
  it("hiding a professional hides their posts", async () => {
    await db.query(
      "UPDATE beauty.posts SET moderation_status='visible' WHERE id=$1",
      [postId],
    );
    await db.query(
      "UPDATE beauty.professional_profiles SET publication_status='hidden' WHERE id=$1",
      [owner],
    );
    expect(await asUser("", publicPosts)).toEqual([]);
  });
});
it("rejects raw HTML owner fields and oversized content", () => {
  expect(postSchema.safeParse({ ...post, professionalId: other }).success).toBe(
    false,
  );
  expect(
    postSchema.safeParse({ ...post, body: "x".repeat(1801) }).success,
  ).toBe(false);
});

describe.sequential("private likes and saves", () => {
  let viewer: string;
  let target: string;
  it("persists independent likes and saves idempotently", async () => {
    await db.query(
      "UPDATE beauty.users SET status='active' WHERE auth_id='alice'",
    );
    await asUser("alice", (sql) =>
      sql.query(
        "UPDATE beauty.professional_profiles SET publication_status='published' WHERE id=$1",
        [owner],
      ),
    );
    target = (
      await asUser("alice", (sql) =>
        savePost(sql, owner, { ...post, publicationStatus: "published" }),
      )
    ).id as string;
    viewer = (
      await asUser("bob", (sql) =>
        sql.query<{ id: string }>(
          "SELECT id FROM beauty.users WHERE auth_id='bob'",
        ),
      )
    ).rows[0].id;
    await asUser("bob", (sql) =>
      saveEngagement(sql, viewer, target, { liked: true, saved: true }),
    );
    await asUser("bob", (sql) =>
      saveEngagement(sql, viewer, target, { liked: true, saved: true }),
    );
    expect(
      await asUser("bob", (sql) => viewerEngagement(sql, [target])),
    ).toEqual({ [target]: { liked: true, saved: true } });
    expect(
      (await asUser("bob", (sql) => savedPosts(sql, 1))).map((p) => p.id),
    ).toContain(target);
  });
  it("does not expose another viewer's activity or accept their identity", async () => {
    expect(
      await asUser("alice", (sql) => viewerEngagement(sql, [target])),
    ).toEqual({});
    expect(await asUser("", (sql) => viewerEngagement(sql, [target]))).toEqual(
      {},
    );
    await expect(
      asUser("alice", (sql) =>
        saveEngagement(sql, viewer, target, { liked: false, saved: false }),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("unsaves without clearing the like", async () => {
    await asUser("bob", (sql) =>
      saveEngagement(sql, viewer, target, { liked: true, saved: false }),
    );
    expect(
      (await asUser("bob", (sql) => savedPosts(sql, 1))).map((p) => p.id),
    ).not.toContain(target);
    expect(
      await asUser("bob", (sql) => viewerEngagement(sql, [target])),
    ).toEqual({ [target]: { liked: true, saved: false } });
  });
  it("removes moderated posts from saved feeds and rejects interaction", async () => {
    await asUser("bob", (sql) =>
      saveEngagement(sql, viewer, target, { liked: true, saved: true }),
    );
    await db.query(
      "UPDATE beauty.posts SET moderation_status='hidden' WHERE id=$1",
      [target],
    );
    expect(
      (await asUser("bob", (sql) => savedPosts(sql, 1))).map((p) => p.id),
    ).not.toContain(target);
    await expect(
      asUser("bob", (sql) =>
        saveEngagement(sql, viewer, target, { liked: true, saved: true }),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("validates device storage and rejects forged payload fields", () => {
    expect(readDeviceEngagement("{bad")).toEqual({});
    expect(
      readDeviceEngagement(
        JSON.stringify({ post: { liked: "yes", saved: true } }),
      ),
    ).toEqual({});
    expect(
      readDeviceEngagement(
        JSON.stringify({ post: { liked: true, saved: false } }),
      ),
    ).toEqual({ post: { liked: true, saved: false } });
    expect(
      engagementSchema.safeParse({ liked: true, saved: true, userId: viewer })
        .success,
    ).toBe(false);
  });
});

describe.sequential("community feed pagination", () => {
  it("returns every published post once across equal and microsecond timestamps", async () => {
    // Operator fixture setup controls timestamps; application users cannot forge them.
    await db.query(
      "INSERT INTO beauty.posts(professional_id,kind,title,body,publication_status,created_at) SELECT $1,'design','Design '||n,'A detailed look at a new design from our studio.','published','2030-01-01T12:00:00Z'::timestamptz+(n%3)*interval '1 microsecond' FROM generate_series(1,85) n",
      [owner],
    );
    const expected = (
      await asUser("", (sql) =>
        sql.query<{ id: string }>(
          "SELECT id FROM beauty.public_posts ORDER BY created_at DESC,id DESC",
        ),
      )
    ).rows.map((row) => row.id);
    const ids: string[] = [];
    let cursor: ReturnType<typeof parsePostCursor>;
    for (let page = 0; page < 5; page++) {
      const result = await asUser("", (sql) => publicPostPage(sql, cursor));
      expect(result.posts.length).toBeLessThanOrEqual(40);
      ids.push(...result.posts.map((post) => post.id));
      if (!result.next) break;
      cursor = parsePostCursor(result.next);
      expect(cursor?.createdAt).toMatch(/\.\d{6}Z$/);
    }
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("rechecks moderation when loading a later page", async () => {
    const first = await asUser("", (sql) => publicPostPage(sql));
    expect(first.next).not.toBeNull();
    const cursor = parsePostCursor(first.next!);
    const second = await asUser("", (sql) => publicPostPage(sql, cursor));
    const hidden = second.posts[0].id;
    await db.query(
      "UPDATE beauty.posts SET moderation_status='hidden' WHERE id=$1",
      [hidden],
    );
    expect(
      (await asUser("", (sql) => publicPostPage(sql, cursor))).posts.map(
        (post) => post.id,
      ),
    ).not.toContain(hidden);
  });
  it("validates bounded cursors without trusting caller-supplied SQL or fields", () => {
    expect(parsePostCursor(null)).toBeUndefined();
    for (const raw of [
      "bad",
      "x".repeat(401),
      Buffer.from(JSON.stringify({ id: postId, createdAt: "bad" })).toString(
        "base64url",
      ),
    ])
      expect(() => parsePostCursor(raw)).toThrow("INVALID_CURSOR");
    const value = { id: postId, createdAt: "2030-01-01T12:00:00.000001Z" };
    expect(parsePostCursor(encodePostCursor(value))).toEqual(value);
  });
});
