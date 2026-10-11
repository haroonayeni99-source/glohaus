import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import {
  enrolAccount,
  findAccount,
  type SqlClient,
} from "@/modules/accounts/repository";
import { AccessError, type Identity } from "@/modules/accounts/domain";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { professionalClients } from "@/modules/dashboard/repository";
import {
  customerNameSchema,
  customerNameFromMetadata,
} from "@/modules/accounts/customer-profile-domain";
import { PUT as blockClient } from "@/app/api/v1/professional/clients/[id]/route";
import { PUT as saveName } from "@/app/api/v1/account/profile/route";
import {
  POST as savePhoto,
  DELETE as removePhoto,
} from "@/app/api/v1/account/profile/photo/route";
import { GET as readPhoto } from "@/app/api/v1/customer-photos/[id]/route";
import { POST as book } from "@/app/api/v1/bookings/route";
const db = await createTestDatabase();
let current: string | null = null;
const identities: Record<string, Identity> = {};
const ids: Record<string, string> = {};
const professionals: Record<string, string> = {};
const services: Record<string, string> = {};
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => {
    if (!current) throw new AccessError("UNAUTHENTICATED", 401);
    return identities[current];
  },
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(
    authId: string,
    work: (sql: SqlClient) => Promise<T>,
  ) => asUser(authId, work),
}));
vi.mock("@/modules/payments/stripe", () => ({
  paymentReady: () => false,
  stripe: () => {
    throw new Error("No Stripe calls permitted in this test");
  },
}));
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
function request(
  path: string,
  body: unknown,
  method = "PUT",
  origin = "https://glohaus.test",
) {
  return new Request(`https://glohaus.test${path}`, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function context(id = ids.alice) {
  return { params: Promise.resolve({ id }) };
}
const future = new Date(Date.now() + 3 * 86400000);
future.setUTCHours(12, 0, 0, 0);
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["pro", "otherpro", "alice", "bob"]) {
    identities[authId] = {
      authId,
      email: `${authId}@example.test`,
      displayName: authId,
      secondFactorAge: null,
      ...(authId === "alice"
        ? { customerName: { firstName: "Alice", lastName: "Jones" } }
        : {}),
    };
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        identities[authId],
        authId.includes("pro") ? "professional" : "customer",
      ),
    );
    ids[authId] = account.id;
    if (account.professionalId) professionals[authId] = account.professionalId;
  }
  for (const authId of ["pro", "otherpro"]) {
    const id = professionals[authId];
    await asUser(authId, async (sql) => {
      await updateProfile(sql, id, {
        slug: `${authId}-studio`,
        businessName: "Test Studio",
        bio: "Independent beauty appointments in London.",
        city: "London",
        category: "Nails",
        publicationStatus: "published",
      });
      services[authId] = (
        await saveService(sql, id, {
          name: "Manicure",
          description: "",
          durationMinutes: 60,
          pricePence: 4500,
          depositPence: 1500,
          active: true,
        })
      ).id as string;
      await saveSchedule(
        sql,
        id,
        Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startMinute: 480,
          endMinute: 1200,
        })),
      );
      await sql.query(
        "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,$2)",
        [id, `acct_${authId}`],
      );
    });
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE beauty_payment_worker");
      await tx.query("SELECT beauty.sync_connect_account($1,true)", [
        `acct_${authId}`,
      ]);
      await tx.query("SELECT beauty.sync_connect_verification($1,true)", [
        `acct_${authId}`,
      ]);
    });
  }
  await db.query(
    `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Manicure','Old name','Test Studio',now()+interval '10 days',now()+interval '10 days 1 hour',60,4500,1500,'confirmed',now())`,
    [professionals.pro, ids.alice, services.pro],
  );
});
afterAll(() => db.close());
describe.sequential("private client identity and booking blocks", () => {
  it("allows a full name or first name and validates limits", () => {
    expect(
      customerNameSchema.parse({ firstName: " Maya ", lastName: "" }),
    ).toEqual({ firstName: "Maya", lastName: "" });
    expect(customerNameSchema.safeParse({ firstName: "  " }).success).toBe(
      false,
    );
    expect(
      customerNameSchema.safeParse({ firstName: "A", lastName: "B".repeat(60) })
        .success,
    ).toBe(false);
    expect(
      customerNameFromMetadata({
        first_name: "Alice",
        last_name: "Jones",
        role: "owner",
      }),
    ).toEqual({ firstName: "Alice", lastName: "Jones" });
  });
  it("initialises customer name on enrolment", async () => {
    expect(
      await asUser("alice", (sql) => findAccount(sql, "alice")),
    ).toMatchObject({ displayName: "Alice Jones" });
  });
  it("customers can save first-only or full names without altering old booking snapshots", async () => {
    current = "alice";
    expect(
      (
        await saveName(
          request("/api/v1/account/profile", {
            firstName: "Alicia",
            lastName: "",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await asUser("pro", (sql) =>
          professionalClients(sql, professionals.pro),
        )
      )[0].customer_name,
    ).toBe("Alicia");
    expect(
      (
        await db.query<{ customer_name: string }>(
          "SELECT customer_name FROM beauty.bookings WHERE customer_id=$1",
          [ids.alice],
        )
      ).rows[0].customer_name,
    ).toBe("Old name");
    expect(
      (
        await saveName(
          request("/api/v1/account/profile", {
            firstName: "Alice",
            lastName: "Jones",
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("sanitises customer photos and keeps them private to booking professionals", async () => {
    current = "alice";
    const image = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect(
      (
        await savePhoto(
          request(
            "/api/v1/account/profile/photo",
            { base64: image.toString("base64"), altText: "Customer portrait" },
            "POST",
          ),
        )
      ).status,
    ).toBe(201);
    for (const actor of ["alice", "pro"]) {
      current = actor;
      const response = await readPhoto(
        new Request("https://glohaus.test"),
        context(),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const info = await sharp(
        Buffer.from(await response.arrayBuffer()),
      ).metadata();
      expect(info.format).toBe("webp");
      expect(info.exif).toBeUndefined();
    }
    for (const actor of [null, "bob", "otherpro"]) {
      current = actor;
      expect(
        (await readPhoto(new Request("https://glohaus.test"), context()))
          .status,
      ).toBe(404);
    }
    expect(
      await asUser("otherpro", (sql) =>
        professionalClients(sql, professionals.pro),
      ),
    ).toEqual([]);
  });
  it("rejects unrelated clients, customers, unauthenticated users, forged ownership and cross-origin requests", async () => {
    current = "pro";
    expect(
      (
        await blockClient(
          request("/clients", { blocked: true }),
          context(ids.bob),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await blockClient(
          request("/clients", {
            blocked: true,
            professionalId: professionals.otherpro,
          }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await blockClient(
          request("/clients", { blocked: true }, "PUT", "https://evil.test"),
          context(),
        )
      ).status,
    ).toBe(403);
    current = "otherpro";
    expect(
      (await blockClient(request("/clients", { blocked: true }), context()))
        .status,
    ).toBe(403);
    current = "alice";
    expect(
      (await blockClient(request("/clients", { blocked: true }), context()))
        .status,
    ).toBe(403);
    current = null;
    expect(
      (await blockClient(request("/clients", { blocked: true }), context()))
        .status,
    ).toBe(401);
  });
  it("blocks through the API and database without changing existing bookings or payments", async () => {
    const before = (await db.query("SELECT * FROM beauty.bookings ORDER BY id"))
      .rows;
    current = "pro";
    expect(
      (await blockClient(request("/clients", { blocked: true }), context()))
        .status,
    ).toBe(200);
    const list = await asUser("pro", (sql) =>
      professionalClients(sql, professionals.pro, {
        q: "jones",
        view: "blocked",
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      blocked: true,
      has_photo: true,
      customer_name: "Alice Jones",
    });
    await expect(
      asUser("alice", (sql) =>
        sql.query("SELECT beauty.reserve_booking($1,$2)", [
          services.pro,
          future.toISOString(),
        ]),
      ),
    ).rejects.toThrow("CLIENT_BLOCKED");
    current = "alice";
    const response = await book(
      request(
        "/api/v1/bookings",
        {
          serviceId: services.pro,
          startsAt: future.toISOString(),
          acceptPolicy: true,
        },
        "POST",
      ),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "CLIENT_BLOCKED" },
    });
    expect(
      (await db.query("SELECT * FROM beauty.bookings ORDER BY id")).rows,
    ).toEqual(before);
    expect(
      (await db.query<{count:number}>("SELECT count(*)::int AS count FROM beauty.payments"))
        .rows[0].count,
    ).toBe(0);
  });
  it("cannot evade a block with a direct insert", async () => {
    await expect(
      db.query(
        `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Manicure','Alice','Test Studio',now()+interval '20 days',now()+interval '20 days 1 hour',60,4500,1500,'confirmed',now())`,
        [professionals.pro, ids.alice, services.pro],
      ),
    ).rejects.toThrow("CLIENT_BLOCKED");
  });
  it("still allows bookings with other professionals and other clients", async () => {
    expect(
      (
        await asUser("alice", (sql) =>
          sql.query<{ data: { id: string } }>(
            "SELECT beauty.reserve_booking($1,$2) AS data",
            [services.otherpro, future.toISOString()],
          ),
        )
      ).rows[0].data.id,
    ).toBeTruthy();
    expect(
      (
        await asUser("bob", (sql) =>
          sql.query<{ data: { id: string } }>(
            "SELECT beauty.reserve_booking($1,$2) AS data",
            [services.pro, future.toISOString()],
          ),
        )
      ).rows[0].data.id,
    ).toBeTruthy();
  });
  it("other professionals cannot unblock and removal of a name/photo cannot evade the account block", async () => {
    await asUser("otherpro", (sql) =>
      sql.query(
        "UPDATE beauty.professional_client_blocks SET blocked=false WHERE professional_id=$1 AND customer_id=$2",
        [professionals.pro, ids.alice],
      ),
    );
    current = "alice";
    expect((await removePhoto(request("/photo", {}, "DELETE"))).status).toBe(
      200,
    );
    expect(
      (
        await saveName(
          request("/profile", { firstName: "Different", lastName: "Name" }),
        )
      ).status,
    ).toBe(200);
    await expect(
      asUser("alice", (sql) =>
        sql.query("SELECT beauty.reserve_booking($1,$2)", [
          services.pro,
          new Date(future.getTime() + 86400000).toISOString(),
        ]),
      ),
    ).rejects.toThrow("CLIENT_BLOCKED");
  });
  it("unblocking restores new bookings and blocked filtering clears", async () => {
    current = "pro";
    expect(
      (await blockClient(request("/clients", { blocked: false }), context()))
        .status,
    ).toBe(200);
    expect(
      await asUser("pro", (sql) =>
        professionalClients(sql, professionals.pro, { view: "blocked" }),
      ),
    ).toEqual([]);
    expect(
      (
        await asUser("alice", (sql) =>
          sql.query<{ data: { id: string } }>(
            "SELECT beauty.reserve_booking($1,$2) AS data",
            [services.pro, new Date(future.getTime() + 86400000).toISOString()],
          ),
        )
      ).rows[0].data.id,
    ).toBeTruthy();
  });
});
