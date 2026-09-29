import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import { savePost } from "@/modules/posts/repository";
import {
  addPostComment,
  deletePostComment,
  postComments,
} from "@/modules/comments/repository";

const db = new PGlite();
let postId = "";
let customerId = "";

async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const professional = await asUser("comment-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "comment-pro",
        email: "comment-pro@example.test",
        displayName: "Comment Studio",
        secondFactorAge: null,
      },
      "professional",
    ),
  );

  await asUser("comment-pro", async (sql) => {
    await updateProfile(sql, professional.professionalId!, {
      slug: "comment-studio",
      businessName: "Comment Studio",
      bio: "Professional profile used for post comment tests.",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    });
    postId = (
      await savePost(sql, professional.professionalId!, {
        title: "Braids transformation",
        body: "A published transformation post for comment testing.",
        kind: "design",
        publicationStatus: "published",
        serviceId: null,
        assetId: null,
      })
    ).id as string;
  });

  const customer = await asUser("comment-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "comment-customer",
        email: "comment-customer@example.test",
        displayName: "Comment Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  customerId = customer.id;
});

afterAll(() => db.close());

describe.sequential("post comments", () => {
  it("allows an active signed-in user to comment on a published post", async () => {
    const comment = await asUser("comment-customer", (sql) =>
      addPostComment(sql, {
        postId,
        userId: customerId,
        authorName: "Comment Customer",
        body: "Love this look!",
      }),
    );
    expect(comment.body).toBe("Love this look!");
    expect(comment.mine).toBe(true);
  });

  it("lets signed-out visitors read visible comments without private user data", async () => {
    const comments = await asUser("", (sql) => postComments(sql, postId, null));
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      post_id: postId,
      author_name: "Comment Customer",
      body: "Love this look!",
      mine: false,
    });
  });

  it("prevents another user from deleting someone else's comment", async () => {
    const other = await asUser("comment-other", (sql) =>
      enrolAccount(
        sql,
        {
          authId: "comment-other",
          email: "comment-other@example.test",
          displayName: "Other Customer",
          secondFactorAge: null,
        },
        "customer",
      ),
    );
    expect(other.id).toBeTruthy();

    const comment = (await asUser("", (sql) => postComments(sql, postId, null)))[0];
    await expect(
      asUser("comment-other", (sql) =>
        deletePostComment(sql, postId, comment.id),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("allows the comment owner to delete their own comment", async () => {
    const comment = (
      await asUser("comment-customer", (sql) =>
        postComments(sql, postId, customerId),
      )
    )[0];
    await asUser("comment-customer", (sql) =>
      deletePostComment(sql, postId, comment.id),
    );
    expect(await asUser("", (sql) => postComments(sql, postId, null))).toEqual([]);
  });

  it("does not expose comments when the professional post is hidden", async () => {
    await asUser("comment-customer", (sql) =>
      addPostComment(sql, {
        postId,
        userId: customerId,
        authorName: "Comment Customer",
        body: "This should disappear with the post.",
      }),
    );
    await db.query(
      "UPDATE beauty.posts SET moderation_status='hidden' WHERE id=$1",
      [postId],
    );
    expect(await asUser("", (sql) => postComments(sql, postId, null))).toEqual([]);
  });
});
