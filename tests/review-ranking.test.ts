import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  publicProfessionals,
  discoveryPage,
} from "@/modules/professionals/repository";
import {
  discoveryOptions,
  defaultDiscoveryFilters,
  type DiscoveryCursor,
} from "@/modules/professionals/discovery";
import { POST as review } from "@/app/api/v1/reviews/route";
const db = await createTestDatabase();
let actor = "customer";
let customerId: string;
const profiles: string[] = [];
const services: string[] = [];
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => ({
    authId: actor,
    email: `${actor}@example.test`,
    displayName: actor,
    secondFactorAge: null,
  }),
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(
    authId: string,
    work: (sql: SqlClient) => Promise<T>,
  ) => asUser(authId, work),
}));
async function booking(pro = 0, status = "completed", future = false) {
  return (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at)
    VALUES($1,$2,$3,'Manicure','Test customer','Test studio',now()+$5::interval,now()+$6::interval,60,5000,1000,$4,now()) RETURNING id`,
      [
        profiles[pro],
        customerId,
        services[pro],
        status,
        future ? "1 hour" : "-2 hours",
        future ? "2 hours" : "-1 hour",
      ],
    )
  ).rows[0].id;
}
function request(id: string, rating = 5, origin = "https://glohaus.test") {
  return new Request("https://glohaus.test/api/v1/reviews", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      bookingId: id,
      rating,
      body: "A carefully delivered appointment with friendly service.",
      publicName: "Test customer",
    }),
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["customer", "outsider"]) {
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: authId,
          secondFactorAge: null,
        },
        "customer",
      ),
    );
    if (authId === "customer") customerId = account.id;
  }
  for (let n = 0; n < 65; n++) {
    const user = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.users(auth_id,email,display_name) VALUES($1,$2,'Test professional') RETURNING id",
        [`rank-${n}`, `rank-${n}@example.test`],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'professional')",
      [user],
    );
    const name =
      n === 0
        ? "Z Trusted Studio"
        : n === 1
          ? "A One Review Studio"
          : `Ranking Studio ${String(n).padStart(2, "0")}`;
    const pro = (
      await db.query<{ id: string }>(
        "INSERT INTO beauty.professional_profiles(user_id,slug,business_name,bio,city,category,publication_status) VALUES($1,$2,$3,'Independent beauty appointments with careful service.','London','Nails','published') RETURNING id",
        [user, `ranking-studio-${n}`, name],
      )
    ).rows[0].id;
    profiles.push(pro);
    await db.query(
      "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified')",
      [pro],
    );
    services.push(
      (
        await db.query<{ id: string }>(
          "INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Manicure',60,5000,1000) RETURNING id",
          [pro],
        )
      ).rows[0].id,
    );
    if (n < 2) {
      await db.query(
        "INSERT INTO beauty.professional_public_locations(professional_id,latitude,longitude,source,confirmed_at) VALUES($1,$2,-0.1278,'pin',now())",
        [pro, n === 0 ? 51.6 : 51.5075],
      );
    }
    const ratings =
      n === 0
        ? Array.from({ length: 20 }, (_, i) => (i < 16 ? 5 : 4))
        : n === 1
          ? [5]
          : n % 3 === 0
            ? [3, 4]
            : [];
    for (const rating of ratings)
      await db.query(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,$2,'A carefully delivered appointment with friendly service.','Test customer')",
        [await booking(n), rating],
      );
  }
});
afterAll(() => db.close());
describe.sequential("Verified reviews and discovery ordering", () => {
  it("places a well-supported high rating above a single five-star review, without changing displayed ratings", async () => {
    const rows = await asUser("", (sql) => publicProfessionals(sql));
    expect(rows[0]).toMatchObject({
      id: profiles[0],
      rating: 4.8,
      review_count: 20,
    });
    expect(rows[1]).toMatchObject({
      id: profiles[1],
      rating: 5,
      review_count: 1,
    });
    const newcomer = rows.find((p) => p.id === profiles[2]);
    expect(newcomer).toMatchObject({ rating: null, review_count: 0 });
  });
  it("keeps distance first across the complete directory in nearby search", async () => {
    const rows = await asUser("", (sql) =>
      publicProfessionals(sql, "", undefined, defaultDiscoveryFilters, {
        latitude: 51.5074,
        longitude: -0.1278,
        radiusMiles: 20,
          query: "",
          filters: defaultDiscoveryFilters,
      }),
    );
    expect(rows.map((p) => p.id)).toEqual([profiles[1], profiles[0]]);
  });
  it("paginates changing score groups without losing or duplicating profiles", async () => {
    const ids: string[] = [];
    let after: DiscoveryCursor | undefined;
    for (let n = 0; n < 4; n++) {
      const page = await asUser("", (sql) => discoveryPage(sql, "", after));
      ids.push(...page.professionals.map((p) => p.id));
      if (!page.next) break;
      after = discoveryOptions({ after: page.next }).after;
    }
    expect(ids).toHaveLength(65);
    expect(new Set(ids).size).toBe(65);
    expect(ids.slice(0, 2)).toEqual([profiles[0], profiles[1]]);
  });
  it("removes hidden reviews from both rating totals and ranking", async () => {
    await db.query(
      "UPDATE beauty.reviews SET moderation_status='hidden' WHERE booking_id IN(SELECT id FROM beauty.bookings WHERE professional_id=$1)",
      [profiles[0]],
    );
    const rows = await asUser("", (sql) => publicProfessionals(sql));
    expect(rows[0].id).toBe(profiles[1]);
    const hidden = await asUser("", sql => publicProfessionals(sql, "Trusted"));
    expect(hidden[0]).toMatchObject({
      rating: null,
      review_count: 0,
    });
    await db.query(
      "UPDATE beauty.reviews SET moderation_status='visible' WHERE booking_id IN(SELECT id FROM beauty.bookings WHERE professional_id=$1)",
      [profiles[0]],
    );
  });
  it("returns a clear duplicate conflict and preserves the original review", async () => {
    actor = "customer";
    const id = await booking(2);
    expect((await review(request(id, 4))).status).toBe(201);
    const duplicate = await review(request(id, 1));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: { code: "REVIEW_ALREADY_EXISTS" },
    });
    expect(
      (
        await db.query(
          "SELECT rating FROM beauty.reviews WHERE booking_id=$1",
          [id],
        )
      ).rows,
    ).toEqual([{ rating: 4 }]);
  });
  it("rejects other customers and unfinished or future appointments as forbidden, not an outage", async () => {
    actor = "outsider";
    expect((await review(request(await booking(2)))).status).toBe(403);
    actor = "customer";
    for (const status of ["confirmed", "cancelled", "no_show"])
      expect((await review(request(await booking(2, status)))).status).toBe(
        403,
      );
    expect(
      (await review(request(await booking(2, "completed", true)))).status,
    ).toBe(403);
  });
  it("rejects invalid star ratings and cross-origin requests before storing reviews", async () => {
    actor = "customer";
    const id = await booking(2);
    for (const rating of [0, 6, 4.5])
      expect((await review(request(id, rating))).status).toBe(400);
    expect((await review(request(id, 5, "https://other.test"))).status).toBe(
      403,
    );
    expect(
      (
        await db.query("SELECT id FROM beauty.reviews WHERE booking_id=$1", [
          id,
        ])
      ).rows,
    ).toEqual([]);
  });
});
