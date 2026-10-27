import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
import sharp from "sharp";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { AccessError, type Identity } from "@/modules/accounts/domain";
const transport = vi.hoisted(() => ({
  identity: vi.fn(),
  run: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/identity", () => ({ getIdentity: transport.identity }));
vi.mock("@/lib/db", () => ({ withIdentity: transport.run }));
vi.mock("@vercel/blob", () => ({
  put: transport.put,
  get: transport.get,
  del: transport.del,
}));
vi.mock("@/modules/notifications/schedule", () => ({
  scheduleNotificationDelivery: transport.notify,
}));
import { POST } from "@/app/api/v1/reviews/route";
import { GET } from "@/app/api/v1/review-photos/[id]/route";
const db = await createTestDatabase();
const objects = new Map<string, Buffer>();
let pro: string,
  service: string,
  image: Buffer,
  sequence = 0;
let failPhotoInsert = false;
const customer: Identity = {
  authId: "photo-customer",
  email: "photo-customer@example.test",
  displayName: "Photo customer",
  secondFactorAge: null,
};
async function as<T>(caller: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [caller]);
    const sql: SqlClient = {
      query: async (query, values) => {
        if (
          failPhotoInsert &&
          query.startsWith("INSERT INTO beauty.review_photos")
        )
          throw Error("Fixture storage-row failure");
        return tx.query(query, values);
      },
    };
    return work(sql);
  });
}
async function booking(completed = true) {
  const date = new Date(Date.now() + (7 + sequence++) * 86400000);
  date.setUTCHours(12, 0, 0, 0);
  const id = await as(
    customer.authId,
    async (sql) =>
      (
        await sql.query<{ data: { id: string } }>(
          "SELECT beauty.reserve_booking($1,$2,beauty.public_service_policy($1)->>'token',true) AS data",
          [service, date.toISOString()],
        )
      ).rows[0].data.id,
  );
  if (completed)
    await db.query(
      "UPDATE beauty.bookings SET status='completed',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour',completed_at=now() WHERE id=$1",
      [id],
    );
  return id;
}
async function submit(id: string, overrides: Record<string, unknown> = {}) {
  return POST(
    new Request("https://www.glohaus.shop/api/v1/reviews", {
      method: "POST",
      headers: {
        Origin: "https://www.glohaus.shop",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bookingId: id,
        rating: 1,
        body: "",
        publicName: "Fixture client",
        answers: { timing: "very_late" },
        privateSuggestion: "Private fixture suggestion",
        photo: {
          base64: image.toString("base64"),
          altText: "Fictional appointment result",
          consent: true,
        },
        ...overrides,
      }),
    }),
  );
}
async function photoFor(id: string) {
  return (
    await db.query<{ id: string; review_id: string; blob_path: string }>(
      "SELECT p.* FROM beauty.review_photos p JOIN beauty.reviews r ON r.id=p.review_id WHERE r.booking_id=$1",
      [id],
    )
  ).rows[0];
}
async function readPhoto(id: string) {
  return GET(
    new Request(`https://www.glohaus.shop/api/v1/review-photos/${id}`),
    { params: Promise.resolve({ id }) },
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const id of ["photo-pro", customer.authId, "photo-other-customer"])
    await as(id, async (sql) => {
      const account = await enrolAccount(
        sql,
        {
          authId: id,
          email: `${id}@example.test`,
          displayName: id,
          secondFactorAge: null,
        },
        id === "photo-pro" ? "professional" : "customer",
      );
      if (id === "photo-pro") pro = account.professionalId!;
    });
  await as("photo-pro", async (sql) => {
    await updateProfile(sql, pro, {
      slug: "photo-flow-fixture",
      businessName: "Photo flow fixture",
      bio: "Fictional studio for isolated review-photo verification.",
      city: "London",
      category: "Nails",
      publicationStatus: "published",
    });
    service = (
      await saveService(sql, pro, {
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
      pro,
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 480,
        endMinute: 1200,
      })),
    );
    await sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_photo_fixture')",
      [pro],
    );
  });
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    await tx.query(
      "SELECT beauty.sync_connect_account('acct_photo_fixture',true)",
    );
    await tx.query(
      "SELECT beauty.sync_connect_verification('acct_photo_fixture',true)",
    );
  });
  image = await sharp({
    create: { width: 24, height: 24, channels: 3, background: "#bb7788" },
  })
    .jpeg()
    .withExif({
      IFD0: {
        Artist: "Private fixture metadata",
        ImageDescription: "Do not publish this metadata",
      },
    })
    .toBuffer();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "isolated-fixture-token");
  transport.identity.mockResolvedValue(customer);
  transport.run.mockImplementation(as);
  failPhotoInsert = false;
  objects.clear();
  transport.put.mockImplementation(async (path: string, bytes: Buffer) => {
    objects.set(path, bytes);
    return {
      pathname: path,
      url: `https://fixture.private.blob.vercel-storage.com/${path}`,
    };
  });
  transport.del.mockImplementation(async (url: string) => {
    objects.delete(new URL(url).pathname.slice(1));
  });
  transport.get.mockImplementation(async (path: string) => {
    const bytes = objects.get(path);
    return bytes
      ? {
          statusCode: 200,
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
        }
      : null;
  });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.close());
it("rejects an unsigned submission before any upload or database write", async () => {
  transport.identity.mockRejectedValue(new AccessError("UNAUTHENTICATED", 401));
  expect((await submit("11111111-1111-4111-8111-111111111111")).status).toBe(
    401,
  );
  expect(transport.put).not.toHaveBeenCalled();
  expect(transport.notify).not.toHaveBeenCalled();
});
it("commits a consented rating-only negative review, strips image metadata and serves only its visible photo", async () => {
  const id = await booking();
  expect((await submit(id)).status).toBe(201);
  const photo = await photoFor(id);
  expect(photo).toBeDefined();
  expect(transport.put.mock.calls[0][2]).toMatchObject({
    access: "private",
    contentType: "image/webp",
  });
  const bytes = objects.get(photo.blob_path)!;
  const metadata = await sharp(bytes).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.exif).toBeUndefined();
  expect(bytes.toString()).not.toContain("Private fixture metadata");
  const response = await readPhoto(photo.id);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  const visible = await as("", (sql) =>
    sql.query("SELECT * FROM beauty.public_reviews WHERE id=$1", [
      photo.review_id,
    ]),
  );
  expect(visible.rows).toHaveLength(1);
  expect(JSON.stringify(visible)).not.toContain("Private fixture suggestion");
  expect(transport.notify).toHaveBeenCalledOnce();
});
it("rejects missing consent and disguised non-image data before storing an object", async () => {
  const id = await booking();
  expect(
    (
      await submit(id, {
        photo: {
          base64: image.toString("base64"),
          altText: "Fixture",
          consent: false,
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await submit(id, {
        photo: {
          base64: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"/>',
          ).toString("base64"),
          altText: "Fixture",
          consent: true,
        },
      })
    ).status,
  ).toBe(400);
  expect(transport.put).not.toHaveBeenCalled();
  expect(await photoFor(id)).toBeUndefined();
});
it("rejects another customer's booking and an unfinished appointment before uploading", async () => {
  const id = await booking();
  transport.identity.mockResolvedValue({
    ...customer,
    authId: "photo-other-customer",
  });
  expect((await submit(id)).status).toBe(403);
  transport.identity.mockResolvedValue(customer);
  expect((await submit(await booking(false))).status).toBe(403);
  expect(transport.put).not.toHaveBeenCalled();
});
it("cleans up the extra private object on a duplicate submission without replacing the first review", async () => {
  const id = await booking();
  expect((await submit(id)).status).toBe(201);
  const original = await photoFor(id);
  expect((await submit(id)).status).toBe(409);
  expect((await photoFor(id)).id).toBe(original.id);
  expect(objects.size).toBe(1);
  expect(transport.del).toHaveBeenCalledOnce();
  expect(transport.notify).toHaveBeenCalledOnce();
});
it("rolls back feedback and removes an uploaded object when the database commit fails", async () => {
  const id = await booking();
  failPhotoInsert = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await submit(id)).status).toBe(503);
  } finally {
    log.mockRestore();
  }
  expect(
    (await db.query("SELECT id FROM beauty.reviews WHERE booking_id=$1", [id]))
      .rows,
  ).toEqual([]);
  expect(objects.size).toBe(0);
  expect(transport.del).toHaveBeenCalledOnce();
  expect(transport.notify).not.toHaveBeenCalled();
});
it("stops serving a moderated review photo before attempting private object retrieval", async () => {
  const id = await booking();
  expect((await submit(id)).status).toBe(201);
  const photo = await photoFor(id);
  await db.query(
    "UPDATE beauty.reviews SET moderation_status='hidden' WHERE id=$1",
    [photo.review_id],
  );
  expect((await readPhoto(photo.id)).status).toBe(404);
  expect(transport.get).not.toHaveBeenCalled();
});
it("fails closed for an unavailable store without saving a review or leaking its path", async () => {
  const id = await booking();
  transport.put.mockRejectedValueOnce(Error("Fixture Blob outage"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await submit(id)).status).toBe(503);
  } finally {
    log.mockRestore();
  }
  expect(await photoFor(id)).toBeUndefined();
  expect(
    (await db.query("SELECT id FROM beauty.reviews WHERE booking_id=$1", [id]))
      .rows,
  ).toEqual([]);
});
