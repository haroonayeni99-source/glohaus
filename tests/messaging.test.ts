import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import {
  conversationInbox,
  conversationMessages,
  conversationMessagePage,
} from "@/modules/messages/repository";

const db = new PGlite();

let professionalId: string;
let professionalUserId: string;
let customerId: string;
let outsiderId: string;
let conversationId: string;

async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }

  const professional = await asUser("message-pro-auth", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "message-pro-auth",
        email: "message-pro@example.test",
        displayName: "Professional Owner",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;
  professionalUserId = professional.id;

  await asUser("message-pro-auth", (sql) =>
    updateProfile(sql, professionalId, {
      slug: "message-studio",
      businessName: "Message Studio",
      bio: "A published professional profile used for private messaging tests.",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    }),
  );

  const customer = await asUser("message-customer-auth", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "message-customer-auth",
        email: "message-customer@example.test",
        displayName: "Messaging Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  customerId = customer.id;

  const outsider = await asUser("message-outsider-auth", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "message-outsider-auth",
        email: "message-outsider@example.test",
        displayName: "Outside Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  outsiderId = outsider.id;
});

afterAll(() => db.close());

describe.sequential("private messaging foundation", () => {
  it("lets a customer start one private thread with a published professional", async () => {
    const result = await asUser("message-customer-auth", async (sql) => {
      const row = (
        await sql.query<{
          result: { conversationId: string; messageId: string };
        }>(
          "SELECT beauty.message_professional($1,$2) AS result",
          [professionalId, "Hi, can I ask about preparing for this service?"],
        )
      ).rows[0];
      return row.result;
    });

    conversationId = result.conversationId;
    expect(result.messageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const inbox = await asUser("message-customer-auth", (sql) =>
      conversationInbox(sql, customerId, null),
    );
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      id: conversationId,
      customer_name: "Messaging Customer",
      professional_name: "Message Studio",
      participant_role: "customer",
      unread_count: 0,
    });
  });

  it("shows the first message unread to the professional and allows a reply", async () => {
    const before = await asUser("message-pro-auth", (sql) =>
      conversationInbox(sql, professionalUserId, professionalId),
    );
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      participant_role: "professional",
      unread_count: 1,
    });

    await asUser("message-pro-auth", (sql) =>
      sql.query(
        "SELECT beauty.send_message($1,$2,$3)",
        [
          conversationId,
          "Of course. I can answer questions before your appointment.",
          null,
        ],
      ),
    );

    const messages = await asUser("message-pro-auth", (sql) =>
      conversationMessages(sql, conversationId),
    );
    expect(messages.map((message) => message.sender_role)).toEqual([
      "customer",
      "professional",
    ]);
  });

  it("supports incremental delivery without reloading the whole thread", async () => {
    const firstPage = await asUser("message-customer-auth", (sql) =>
      conversationMessagePage(sql, conversationId),
    );
    expect(firstPage.messages).toHaveLength(2);
    expect(firstPage.next).toBeTruthy();

    await asUser("message-pro-auth", (sql) =>
      sql.query("SELECT beauty.send_message($1,$2,$3)", [
        conversationId,
        "Here is one more update for the incremental delivery test.",
        null,
      ]),
    );

    const { parseMessageCursor } = await import(
      "@/modules/messages/pagination"
    );
    const nextPage = await asUser("message-customer-auth", (sql) =>
      conversationMessagePage(
        sql,
        conversationId,
        parseMessageCursor(firstPage.next),
      ),
    );
    expect(nextPage.messages).toHaveLength(1);
    expect(nextPage.messages[0].body).toBe(
      "Here is one more update for the incremental delivery test.",
    );
  });

  it("tracks unread state independently for each participant", async () => {
    const customerInbox = await asUser("message-customer-auth", (sql) =>
      conversationInbox(sql, customerId, null),
    );
    expect(customerInbox[0].unread_count).toBe(1);

    await asUser("message-customer-auth", (sql) =>
      sql.query("SELECT beauty.mark_conversation_read($1)", [conversationId]),
    );

    const afterRead = await asUser("message-customer-auth", (sql) =>
      conversationInbox(sql, customerId, null),
    );
    expect(afterRead[0].unread_count).toBe(0);
  });

  it("does not expose another user's thread or messages", async () => {
    expect(
      await asUser("message-outsider-auth", (sql) =>
        conversationInbox(sql, outsiderId, null),
      ),
    ).toEqual([]);

    expect(
      await asUser("message-outsider-auth", (sql) =>
        conversationMessages(sql, conversationId),
      ),
    ).toEqual([]);

    await expect(
      asUser("message-outsider-auth", (sql) =>
        sql.query("SELECT beauty.send_message($1,$2,$3)", [
          conversationId,
          "I should not be able to enter this thread.",
          null,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("rejects empty message content", async () => {
    await expect(
      asUser("message-customer-auth", (sql) =>
        sql.query("SELECT beauty.send_message($1,$2,$3)", [
          conversationId,
          "   ",
          null,
        ]),
      ),
    ).rejects.toThrow();
  });
});
