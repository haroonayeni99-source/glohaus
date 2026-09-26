import { GET as readFeed } from "@/app/api/v1/posts/route";
import { PUT as reactToPost } from "@/app/api/v1/posts/[id]/engagement/route";
import { savePost } from "@/modules/posts/repository";
import { bookingPage } from "@/modules/bookings/repository";
import { bookingListOptions } from "@/modules/bookings/listing";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { AccessError, type Identity } from "@/modules/accounts/domain";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  publicProfile,
  updateProfile,
} from "@/modules/professionals/repository";
import { profileSchema } from "@/modules/professionals/domain";
import { replaceProfilePhoto } from "@/modules/professionals/photo";
import { PUT as saveProfile } from "@/app/api/v1/professional/profile/route";
import {
  POST as uploadPhoto,
  DELETE as deletePhoto,
} from "@/app/api/v1/professional/profile/photo/route";
import {
  PUT as editService,
  DELETE as deactivateServiceRoute,
} from "@/app/api/v1/professional/services/[id]/route";
import { POST as addService } from "@/app/api/v1/professional/services/route";
import { PUT as saveHours } from "@/app/api/v1/professional/availability/route";
import { GET as readPhoto } from "@/app/api/media/[id]/route";
import { POST as createBooking } from "@/app/api/v1/bookings/route";
vi.mock("@/modules/payments/stripe", () => ({
  paymentReady: () => false,
  stripe: () => {
    throw new Error("Stripe must not be called for these bookings");
  },
}));
const storage = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("@vercel/blob", () => ({
  put: vi.fn(
    async (path: string, bytes: Uint8Array, options: { access: string }) => {
      expect(options.access).toBe("private");
      storage.set(path, bytes);
      return { pathname: path, url: `https://private.test/${path}` };
    },
  ),
  del: vi.fn(async (path: string) => {
    storage.delete(path);
  }),
  get: vi.fn(async (path: string) =>
    storage.has(path)
      ? {
          statusCode: 200,
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(storage.get(path));
              controller.close();
            },
          }),
        }
      : null,
  ),
}));
let current: Identity | null = null;
const db = new PGlite();
const identities = Object.fromEntries(
  ["maya", "other", "client"].map((authId) => [
    authId,
    {
      authId,
      email: `${authId}-private@example.test`,
      displayName: authId,
      secondFactorAge: null,
    },
  ]),
);
let owner: string;
let other: string;
let imageBase64: string;
let photoId: string;
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(
    authId: string,
    work: (sql: SqlClient) => Promise<T>,
  ) => asUser(authId, work),
}));
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => {
    if (!current) throw new AccessError("UNAUTHENTICATED", 401);
    return current;
  },
}));
const profile = {
  slug: "maya-studio",
  businessName: "Maya Studio",
  bio: "Thoughtful nail artistry in a welcoming London studio.",
  city: "London",
  category: "Nails" as const,
  publicationStatus: "draft" as "draft" | "published" | "hidden",
  businessDescription:
    "Independent nail artistry.\nA calm space for your next appointment.",
  locationDetails: "Shoreditch",
  contactPreference: "booking" as "booking" | "email" | "phone" | "instagram",
  contactEmail: "hello@maya.example",
  contactPhone: "+44 20 1234 5678",
  instagramUrl: "https://www.instagram.com/mayastudio",
  tiktokUrl: "https://www.tiktok.com/@mayastudio",
  websiteUrl: "https://maya.example",
};
function request(body: unknown, method = "PUT") {
  return new Request("https://glohaus.test/api", {
    method,
    headers: {
      origin: "https://glohaus.test",
      "content-type": "application/json",
    },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
}
const photoContext = () => ({ params: Promise.resolve({ id: photoId }) });
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://glohaus.test");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-token");
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  for (const identity of Object.values(identities)) {
    const account = await asUser(identity.authId, (sql) =>
      enrolAccount(
        sql,
        identity,
        identity.authId === "client" ? "customer" : "professional",
      ),
    );
    if (identity.authId === "maya") owner = account.professionalId!;
    if (identity.authId === "other") other = account.professionalId!;
  }
  imageBase64 = (
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#dcc5bd" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer()
  ).toString("base64");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});
describe.sequential(
  "profile creation, editing, image storage and public viewing through actual route handlers",
  () => {
    it("requires an authenticated professional", async () => {
      current = null;
      expect((await saveProfile(request(profile))).status).toBe(401);
      current = identities.client;
      expect((await saveProfile(request(profile))).status).toBe(403);
    });
    it("saves a complete draft without exposing it publicly", async () => {
      current = identities.maya;
      expect((await saveProfile(request(profile))).status).toBe(200);
      expect(
        await asUser("", (sql) => publicProfile(sql, profile.slug)),
      ).toBeNull();
    });
    it("uploads a private sanitized photo readable only by its owner", async () => {
      const response = await uploadPhoto(
        request(
          { base64: imageBase64, altText: "Maya studio portrait" },
          "POST",
        ),
      );
      expect(response.status).toBe(201);
      photoId = (await response.json()).id;
      const bytes = [...storage.values()][0];
      const metadata = await sharp(bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
      expect(
        (await readPhoto(new Request("https://glohaus.test"), photoContext()))
          .status,
      ).toBe(200);
      current = identities.other;
      expect(
        (await readPhoto(new Request("https://glohaus.test"), photoContext()))
          .status,
      ).toBe(404);
      current = null;
      expect(
        (await readPhoto(new Request("https://glohaus.test"), photoContext()))
          .status,
      ).toBe(404);
      current = identities.maya;
    });
    it("creates service prices and opening hours then publishes the public page data", async () => {
      expect(
        (
          await addService(
            request(
              {
                name: "Gel manicure",
                description: "Precision shaping and colour",
                durationMinutes: 60,
                pricePence: 4500,
                depositPence: 0,
                active: true,
              },
              "POST",
            ),
          )
        ).status,
      ).toBe(201);
      expect(
        (
          await saveHours(
            request({
              rules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
            }),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await saveProfile(
            request({ ...profile, publicationStatus: "published" }),
          )
        ).status,
      ).toBe(200);
      const data = await asUser("", (sql) => publicProfile(sql, profile.slug));
      expect(data?.professional.business_name).toBe("Maya Studio");
      expect(data?.services[0].price_pence).toBe(4500);
      expect(data?.details.photo_id).toBe(photoId);
      expect(data?.details.contact_email).toBe("");
      expect(data?.details.contact_phone).toBe("");
      expect(JSON.stringify(data)).not.toContain("maya-private");
      expect(
        (
          await asUser("", (sql) =>
            sql.query(
              "SELECT * FROM beauty.public_hours WHERE professional_id=$1",
              [owner],
            ),
          )
        ).rows,
      ).toHaveLength(1);
      current = null;
      expect(
        (await readPhoto(new Request("https://glohaus.test"), photoContext()))
          .status,
      ).toBe(200);
      current = identities.maya;
    });
    it("edits the public details and exposes only the selected contact method", async () => {
      expect(
        (
          await saveProfile(
            request({
              ...profile,
              businessName: "Maya Nail Atelier",
              contactPreference: "email",
              publicationStatus: "published",
            }),
          )
        ).status,
      ).toBe(200);
      const data = await asUser("", (sql) => publicProfile(sql, profile.slug));
      expect(data?.professional.business_name).toBe("Maya Nail Atelier");
      expect(data?.details.contact_email).toBe("hello@maya.example");
      expect(data?.details.contact_phone).toBe("");
    });
    it("rejects foreign owner IDs, unsafe links and missing preferred contact data", async () => {
      for (const input of [
        { ...profile, professionalId: other },
        { ...profile, websiteUrl: "javascript:alert(1)" },
        {
          ...profile,
          instagramUrl: "https://instagram.com.attacker.test/name",
        },
        { ...profile, contactPreference: "phone", contactPhone: "" },
      ])
        expect((await saveProfile(request(input))).status).toBe(400);
      await expect(
        asUser("other", (sql) => updateProfile(sql, owner, profile)),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        asUser("other", (sql) =>
          replaceProfilePhoto(sql, owner, {
            id: "00000000-0000-4000-8000-000000000001",
            path: "forged.webp",
            alt: "Forged photo",
          }),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("reports duplicate profile URLs without changing the existing profile", async () => {
      current = identities.other;
      expect(
        (
          await saveProfile(
            request({ ...profile, publicationStatus: "published" }),
          )
        ).status,
      ).toBe(409);
      current = identities.maya;
    });
    it("rejects non-image bytes without writing to storage", async () => {
      const count = storage.size;
      expect(
        (
          await uploadPhoto(
            request(
              {
                base64: Buffer.from("<script>bad</script>").toString("base64"),
                altText: "Bad image",
              },
              "POST",
            ),
          )
        ).status,
      ).toBe(400);
      expect(storage.size).toBe(count);
    });
    it("replaces the photo and removes access to the old URL", async () => {
      const oldId = photoId;
      const response = await uploadPhoto(
        request(
          { base64: imageBase64, altText: "Updated studio portrait" },
          "POST",
        ),
      );
      expect(response.status).toBe(201);
      photoId = (await response.json()).id;
      expect(photoId).not.toBe(oldId);
      expect(storage.size).toBe(1);
      expect(
        (
          await readPhoto(new Request("https://glohaus.test"), {
            params: Promise.resolve({ id: oldId }),
          })
        ).status,
      ).toBe(404);
    });
    it("hiding or suspending a professional removes public details and photos", async () => {
      expect(
        (
          await saveProfile(
            request({ ...profile, publicationStatus: "hidden" }),
          )
        ).status,
      ).toBe(200);
      current = null;
      expect(
        await asUser("", (sql) => publicProfile(sql, profile.slug)),
      ).toBeNull();
      expect(
        (await readPhoto(new Request("https://glohaus.test"), photoContext()))
          .status,
      ).toBe(404);
      current = identities.maya;
      await saveProfile(
        request({ ...profile, publicationStatus: "published" }),
      );
      await db.query(
        "UPDATE beauty.users SET status='suspended' WHERE auth_id='maya'",
      );
      current = null;
      expect(
        await asUser("", (sql) => publicProfile(sql, profile.slug)),
      ).toBeNull();
      expect(
        (await readPhoto(new Request("https://glohaus.test"), photoContext()))
          .status,
      ).toBe(404);
      current = identities.maya;
      expect((await saveProfile(request(profile))).status).toBe(403);
      await db.query(
        "UPDATE beauty.users SET status='active' WHERE auth_id='maya'",
      );
    });
    it("removes the profile photo without changing portfolio or business details", async () => {
      expect((await deletePhoto(request(null, "DELETE"))).status).toBe(200);
      expect(storage.size).toBe(0);
      const data = await asUser("", (sql) => publicProfile(sql, profile.slug));
      expect(data?.details.photo_id).toBeNull();
      expect(data?.professional.business_name).toBe(profile.businessName);
    });
  },
);
it("bounds business details and rejects credentials in social links", () => {
  for (const input of [
    { ...profile, businessDescription: "x".repeat(3001) },
    { ...profile, contactEmail: "bad" },
    { ...profile, websiteUrl: "https://secret@site.test" },
    { ...profile, tiktokUrl: "http://www.tiktok.com/@name" },
  ])
    expect(profileSchema.safeParse(input).success).toBe(false);
});

describe.sequential("booking without a payment-provider setup", () => {
  let serviceId: string;
  let startsAt: string;
  let bookingId: string;
  it("requires payment setup even for a zero-deposit service because the £1 booking fee is mandatory", async () => {
    current = identities.client;
    serviceId = (await asUser("", (sql) => publicProfile(sql, profile.slug)))!
      .services[0].id;
    const monday = new Date(Date.now() + 86400000);
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
    monday.setUTCHours(12, 0, 0, 0);
    startsAt = monday.toISOString();
    const input = { serviceId, startsAt, acceptPolicy: true };
    const response = await createBooking(request(input, "POST"));
    expect(response.status).toBe(503);
    expect(
      (
        await db.query("SELECT id FROM beauty.bookings WHERE starts_at=$1", [
          startsAt,
        ])
      ).rows,
    ).toEqual([]);
    bookingId = "";
  });
  it("does not hold a slot when a deposit is required but runtime payment setup is absent", async () => {
    await db.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id,charges_enabled) VALUES($1,'acct_fixture',true)",
      [owner],
    );
    await db.query(
      "UPDATE beauty.services SET deposit_pence=1500 WHERE id=$1",
      [serviceId],
    );
    const later = new Date(Date.parse(startsAt) + 2 * 3600000).toISOString();
    const response = await createBooking(
      request({ serviceId, startsAt: later, acceptPolicy: true }, "POST"),
    );
    expect(response.status).toBe(503);
    expect(
      (
        await db.query("SELECT id FROM beauty.bookings WHERE starts_at=$1", [
          later,
        ])
      ).rows,
    ).toEqual([]);
    await db.query("UPDATE beauty.services SET deposit_pence=0 WHERE id=$1", [
      serviceId,
    ]);
  });
});

describe.sequential("scoped appointment history and pagination", () => {
  let customerId: string;
  let seeded: string[];
  it("paginates equal start times without omissions or duplicates", async () => {
    customerId = (
      await db.query<{ id: string }>(
        "SELECT id FROM beauty.users WHERE auth_id='client'",
      )
    ).rows[0].id;
    const serviceId = (await asUser("", (sql) =>
      publicProfile(sql, profile.slug),
    ))!.services[0].id;
    seeded = (
      await db.query<{ id: string }>(
        `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) SELECT $1,$2,$3,'Manicure','Client','Studio',now()+interval '30 days',now()+interval '30 days 1 hour',60,4500,0,'confirmed',now() FROM generate_series(1,28) RETURNING id`,
        [owner, customerId, serviceId],
      )
    ).rows.map((r) => r.id);
    await db.query(
      "INSERT INTO beauty.payments(booking_id,status) SELECT unnest($1::uuid[]),'paid'",
      [seeded],
    );
    const first = await asUser("client", (sql) =>
      bookingPage(
        sql,
        { role: "customer", id: customerId },
        { view: "upcoming" },
      ),
    );
    expect(first.bookings).toHaveLength(25);
    expect(first.next).not.toBeNull();
    const second = await asUser("client", (sql) =>
      bookingPage(
        sql,
        { role: "customer", id: customerId },
        bookingListOptions({ view: "upcoming", after: first.next! }),
      ),
    );
    expect(second.bookings).toHaveLength(3);
    expect(second.next).toBeNull();
    expect(
      new Set([...first.bookings, ...second.bookings].map((r) => r.id)).size,
    ).toBe(28);
  });
  it("keeps foreign appointment records inaccessible even with a valid cursor", async () => {
    const first = await asUser("client", (sql) =>
      bookingPage(
        sql,
        { role: "customer", id: customerId },
        { view: "upcoming" },
      ),
    );
    expect(
      (
        await asUser("other", (sql) =>
          bookingPage(
            sql,
            { role: "customer", id: customerId },
            bookingListOptions({ after: first.next! }),
          ),
        )
      ).bookings,
    ).toEqual([]);
    const professionalPage = await asUser("maya", (sql) =>
      bookingPage(
        sql,
        { role: "professional", id: owner },
        { view: "upcoming" },
      ),
    );
    expect(professionalPage.bookings).toHaveLength(25);
    expect(
      (
        await asUser("maya", (sql) =>
          bookingPage(
            sql,
            { role: "professional", id: other },
            { view: "all" },
          ),
        )
      ).bookings,
    ).toEqual([]);
  });
  it("moves cancelled appointments and expired holds into history", async () => {
    await db.query(
      "UPDATE beauty.bookings SET status='cancelled' WHERE id=$1",
      [seeded[0]],
    );
    await db.query(
      "UPDATE beauty.bookings SET status='payment_pending',hold_expires_at=now()-interval '1 minute' WHERE id=$1",
      [seeded[1]],
    );
    const history = await asUser("client", (sql) =>
      bookingPage(
        sql,
        { role: "customer", id: customerId },
        { view: "history" },
      ),
    );
    expect(history.bookings.map((b) => b.status).sort()).toEqual([
      "cancelled",
      "expired",
    ]);
    const upcoming = await asUser("client", (sql) =>
      bookingPage(
        sql,
        { role: "customer", id: customerId },
        { view: "upcoming" },
      ),
    );
    expect(
      upcoming.bookings.some((b) => b.id === seeded[0] || b.id === seeded[1]),
    ).toBe(false);
  });
});
it("ignores malformed pagination tokens and unsupported views", () => {
  expect(bookingListOptions({ view: "private", after: "bad" })).toEqual({
    view: "upcoming",
    after: undefined,
  });
  expect(
    bookingListOptions({ view: "history", after: "a".repeat(401) }),
  ).toEqual({ view: "history", after: undefined });
  expect(
    bookingListOptions({
      after: Buffer.from(
        JSON.stringify({ startsAt: "invalid", id: "foreign" }),
      ).toString("base64url"),
    }),
  ).toEqual({ view: "upcoming", after: undefined });
});

it("manages a service through authenticated routes and rejects another owner", async () => {
  current = identities.maya;
  const input = {
    name: "Nail Set",
    description: "Sculpted nails",
    durationMinutes: 90,
    pricePence: 4500,
    depositPence: 0,
    active: true,
  };
  const created = await addService(request(input, "POST"));
  expect(created.status).toBe(201);
  const id = (await created.json()).service.id;
  const context = { params: Promise.resolve({ id }) };
  current = identities.other;
  expect(
    (await editService(request({ ...input, pricePence: 1 }), context)).status,
  ).toBe(400);
  expect((await editService(request(input), context)).status).toBe(403);
  expect(
    (await deactivateServiceRoute(request(null, "DELETE"), context)).status,
  ).toBe(403);
  current = identities.maya;
  expect(
    (
      await editService(
        request({
          ...input,
          description: "Updated nail art",
          pricePence: 5000,
        }),
        context,
      )
    ).status,
  ).toBe(200);
  expect(
    (await deactivateServiceRoute(request(null, "DELETE"), context)).status,
  ).toBe(200);
  expect(
    (
      await asUser("", (sql) => publicProfile(sql, profile.slug))
    )?.services.some((s) => s.id === id),
  ).toBe(false);
  expect((await editService(request(input), context)).status).toBe(200);
  expect(
    (
      await asUser("", (sql) => publicProfile(sql, profile.slug))
    )?.services.find((s) => s.id === id),
  ).toMatchObject({
    name: "Nail Set",
    price_pence: 4500,
    duration_minutes: 90,
  });
  current = null;
});

it("derives the engagement viewer from the authenticated session", async () => {
  current = identities.maya;
  const pro = (
    await asUser("maya", (sql) =>
      sql.query<{ id: string }>("SELECT id FROM beauty.professional_profiles"),
    )
  ).rows[0].id;
  await asUser("maya", (sql) =>
    updateProfile(sql, pro, { ...profile, publicationStatus: "published" }),
  );
  const id = (
    await asUser("maya", (sql) =>
      savePost(sql, pro, {
        title: "A new nail design",
        body: "A thoughtful new design created in our studio.",
        kind: "design",
        publicationStatus: "published",
        serviceId: null,
      }),
    )
  ).id as string;
  const context = { params: Promise.resolve({ id }) };
  current = identities.client;
  expect(
    (await reactToPost(request({ liked: true, saved: true }), context)).status,
  ).toBe(200);
  expect(
    (
      await reactToPost(
        request({ liked: false, saved: true, userId: "forged" }),
        context,
      )
    ).status,
  ).toBe(400);
  current = null;
  expect(
    (await reactToPost(request({ liked: true, saved: true }), context)).status,
  ).toBe(401);
});

it("serves public feed pages without leaking another viewer's saved state", async () => {
  current = null;
  const result = await readFeed(
    new Request("https://glohaus.test/api/v1/posts"),
  );
  expect(result.status).toBe(200);
  const data = await result.json();
  expect(data.posts.length).toBeGreaterThan(0);
  expect(data.engagement).toEqual({});
  expect(
    (
      await readFeed(
        new Request("https://glohaus.test/api/v1/posts?after=invalid"),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await readFeed(
        new Request("https://glohaus.test/api/v1/posts?ids=invalid"),
      )
    ).status,
  ).toBe(400);
});
