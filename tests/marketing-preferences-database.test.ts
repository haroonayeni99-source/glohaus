import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import {
  marketingPreferences,
  marketingPreferenceFields,
} from "@/lib/marketing-preferences";
import { POST } from "@/app/api/v1/account/marketing-preferences/route";
const db = await createTestDatabase();
const session = vi.hoisted(() => ({ authId: "prefs-customer", denied: false }));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (_: unknown, work: (sql: unknown) => Promise<unknown>) => {
    if (session.denied) throw new AccessError("UNAUTHENTICATED", 401);
    return db.transaction(async (sql) => {
      await sql.exec("SET LOCAL ROLE beauty_app");
      await sql.query("SELECT set_config('app.auth_id',$1,true)", [
        session.authId,
      ]);
      return work(sql);
    });
  },
}));
const ids: Record<string, string> = {};
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["prefs-customer", "prefs-professional"]) {
    const account = await db.transaction(async (sql) => {
      await sql.exec("SET LOCAL ROLE beauty_app");
      await sql.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
      return enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: authId,
          secondFactorAge: null,
        },
        "customer",
      );
    });
    ids[authId] = account.id;
    await db.query(
      "INSERT INTO beauty.marketing_preferences(user_id) VALUES($1)",
      [account.id],
    );
  }
});
afterAll(() => db.close());
function request(body: unknown, origin = "https://glohaus.test") {
  return new Request(
    "https://glohaus.test/api/v1/account/marketing-preferences",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
async function stored(authId = session.authId) {
  return (
    await db.query<{ data: Record<string, unknown> }>(
      "SELECT to_jsonb(p)-'user_id' AS data FROM beauty.marketing_preferences p WHERE user_id=$1",
      [ids[authId]],
    )
  ).rows[0].data;
}
it("saves every choice through the real route and database, reloads correctly, and isolates accounts", async () => {
  const token = (await stored()).unsubscribe_token;
  let choices = marketingPreferences({});
  for (const key of Object.keys(marketingPreferenceFields)) {
    choices = { ...choices, [key]: true };
    const response = await POST(request(choices));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preferences: choices });
    expect(marketingPreferences(await stored())).toEqual(choices);
  }
  expect(
    Object.values(
      marketingPreferences(await stored("prefs-professional")),
    ).every((value) => value === false),
  ).toBe(true);
  expect((await stored()).unsubscribe_token).toBe(token);
  const response = await POST(request(marketingPreferences({})));
  expect(response.status).toBe(200);
  expect(
    Object.values(marketingPreferences(await stored())).every(
      (value) => value === false,
    ),
  ).toBe(true);
  expect((await stored()).unsubscribe_token).toBe(token);
});
it("rejects raw database rows, invalid choices and cross-origin saves without changing preferences", async () => {
  const before = await stored();
  expect((await POST(request(before))).status).toBe(400);
  expect((await POST(request({ customerOffers: "true" }))).status).toBe(400);
  expect(
    (await POST(request({ customerOffers: true }, "https://other.test")))
      .status,
  ).toBe(403);
  expect(await stored()).toEqual(before);
});
it("requires a signed-in account", async () => {
  session.denied = true;
  try {
    expect((await POST(request({ customerOffers: true }))).status).toBe(401);
  } finally {
    session.denied = false;
  }
});
