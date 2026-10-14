import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import { defaultPolicy, type PolicyPreview } from "@/modules/policies/domain";
import { GET as publicPolicy } from "@/app/api/v1/policies/route";
import {
  GET as workspace,
  POST as savePolicy,
} from "@/app/api/v1/professional/policies/route";
import {
  GET as adminOverview,
  POST as moderate,
} from "@/app/api/v1/admin/policies/route";
import {
  GET as readBooking,
  POST as changePolicy,
} from "@/app/api/v1/bookings/[id]/policy/route";
import {
  GET as readPhoto,
  POST as uploadPhoto,
  DELETE as deletePhoto,
} from "@/app/api/v1/bookings/[id]/policy/photos/route";
import { GET as availability } from "@/app/api/v1/bookings/[id]/policy/availability/route";
import { POST as checkout } from "@/app/api/v1/bookings/route";

const db = await createTestDatabase();
let actor: string | null = "api-policy-pro";
let mfa: number | null = 0;
let pro: string;
let service: string;
let booking: string;
let version: string;
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => {
    if (!actor) throw new AccessError("UNAUTHENTICATED", 401);
    return {
      authId: actor,
      email: actor + "@example.test",
      displayName: actor,
      secondFactorAge: mfa,
    };
  },
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(auth: string, work: (sql: SqlClient) => Promise<T>) =>
    asUser(auth, work),
}));
vi.mock("@/modules/payments/stripe", () => ({
  paymentReady: () => false,
  stripe: provider,
}));
async function asUser<T>(auth: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [auth]);
    return work(tx);
  });
}
const context = () => ({ params: Promise.resolve({ id: booking }) });
function request(
  path: string,
  body?: unknown,
  method = "POST",
  origin = "https://glohaus.test",
) {
  return new Request("https://glohaus.test" + path, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
async function published() {
  const r = await publicPolicy(
    request("/api/v1/policies?serviceId=" + service, undefined, "GET"),
  );
  expect(r.status).toBe(200);
  return (await r.json()) as {
    policy: PolicyPreview;
    earlyServiceBefore: string;
  };
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const auth of [
    "api-policy-pro",
    "api-policy-customer",
    "api-policy-other",
    "api-policy-admin",
  ]) {
    const a = await asUser(auth, (tx) =>
      enrolAccount(
        tx,
        {
          authId: auth,
          email: auth + "@example.test",
          displayName: auth,
          secondFactorAge: null,
        },
        auth === "api-policy-pro" ? "professional" : "customer",
      ),
    );
    if (auth === "api-policy-pro") pro = a.professionalId!;
    if (auth === "api-policy-admin")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [a.id],
      );
  }
  await db.query(
    "UPDATE beauty.professional_profiles SET slug='api-policy-studio',business_name='API Policy Studio',bio='Independent beauty appointments',city='London',category='Nails',publication_status='published' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id,charges_enabled) VALUES($1,'acct_api_policy',true)",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Policy manicure','',60,5000,1500,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
  for (let weekday = 0; weekday < 7; weekday++)
    await db.query(
      "INSERT INTO beauty.availability_rules(professional_id,weekday,start_minute,end_minute) VALUES($1,$2,0,1440)",
      [pro, weekday],
    );
  const p = await published();
  const starts = new Date(
    Math.ceil((Date.now() + 72 * 3600000) / 900000) * 900000,
  ).toISOString();
  booking = await asUser(
    "api-policy-customer",
    async (tx) =>
      (
        await tx.query<{ data: { id: string } }>(
          "SELECT beauty.reserve_booking($1,$2,$3,true) AS data",
          [service, starts, p.policy.token],
        )
      ).rows[0].data.id,
  );
});
afterAll(() => db.close());
describe("professional policy API boundaries with actual migrations and RLS", () => {
  it("serves the applicable policy and authoritative calendar deadline without private account data", async () => {
    const p = await published();
    expect(p.policy).toMatchObject({
      depositPence: 1500,
      bookingFeePence: 100,
    });
    expect(Date.parse(p.earlyServiceBefore)).toBeGreaterThan(Date.now());
    expect(JSON.stringify(p)).not.toContain("email");
  });
  it("requires a professional and rejects forged scope ownership or cross-origin writes", async () => {
    const body = {
      serviceId: null,
      action: "save",
      expectedRevision: 0,
      policy: defaultPolicy,
    };
    actor = null;
    expect(
      (await savePolicy(request("/api/v1/professional/policies", body))).status,
    ).toBe(401);
    actor = "api-policy-customer";
    expect(
      (await savePolicy(request("/api/v1/professional/policies", body))).status,
    ).toBe(403);
    actor = "api-policy-pro";
    expect(
      (
        await savePolicy(
          request(
            "/api/v1/professional/policies",
            body,
            "POST",
            "https://foreign.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await savePolicy(
          request("/api/v1/professional/policies", {
            ...body,
            serviceId: "11111111-1111-4111-8111-111111111111",
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("saves private custom wording pending review and reloads the persistent workspace", async () => {
    actor = "api-policy-pro";
    const response = await savePolicy(
      request("/api/v1/professional/policies", {
        serviceId: null,
        action: "publish",
        expectedRevision: 0,
        policy: {
          ...defaultPolicy,
          customRules: "Bring agreed extensions to your appointment.",
        },
      }),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    version = result.versionId;
    expect(result.reviewRequired).toBe(true);
    expect((await published()).policy.generalVersionId).toBeNull();
    const w = await workspace();
    expect(w.status).toBe(200);
    expect((await w.json()).versions[0].id).toBe(version);
  });
  it("enforces Admin MFA and publishes only after a confirmed authenticated review", async () => {
    actor = "api-policy-admin";
    mfa = null;
    expect(
      (await adminOverview(request("/api/v1/admin/policies", undefined, "GET")))
        .status,
    ).toBe(403);
    const body = {
      action: "approve",
      versionId: version,
      reason: "Reviewed service instructions and consumer rights",
      confirmed: true,
    };
    expect(
      (await moderate(request("/api/v1/admin/policies", body))).status,
    ).toBe(403);
    mfa = 0;
    expect(
      (await moderate(request("/api/v1/admin/policies", body))).status,
    ).toBe(200);
    expect((await published()).policy.generalVersionId).toBe(version);
    const response = await adminOverview(
      request(
        "/api/v1/admin/policies?q=API%20Policy%20Studio",
        undefined,
        "GET",
      ),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(
      data.audit.some((a: { action: string }) => a.action === "approve"),
    ).toBe(true);
    expect(data.disputes).toEqual([]);
  });
  it("rejects checkout without explicit acknowledgement before touching any payment provider", async () => {
    actor = "api-policy-customer";
    const startsAt = new Date(
      Math.ceil((Date.now() + 96 * 3600000) / 900000) * 900000,
    ).toISOString();
    expect(
      (
        await checkout(
          request("/api/v1/bookings", {
            serviceId: service,
            startsAt,
            acceptPolicy: false,
          }),
        )
      ).status,
    ).toBe(400);
    const p = await published();
    expect(
      (
        await checkout(
          request("/api/v1/bookings", {
            serviceId: service,
            startsAt,
            acceptPolicy: true,
            earlyServiceRequested: true,
            policyToken: "0".repeat(32),
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await checkout(
          request("/api/v1/bookings", {
            serviceId: service,
            startsAt,
            acceptPolicy: true,
            earlyServiceRequested: true,
            policyToken: p.policy.token,
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await db.query("SELECT id FROM beauty.bookings")).rows,
    ).toHaveLength(1);
    expect(provider).not.toHaveBeenCalled();
  });
  it("keeps accepted terms unchanged and rejects another customer on booking and availability endpoints", async () => {
    actor = "api-policy-customer";
    const r = await readBooking(
      request("/policy", undefined, "GET"),
      context(),
    );
    expect(r.status).toBe(200);
    expect((await r.json()).terms.snapshot.generalVersionId).toBeNull();
    actor = "api-policy-other";
    expect(
      (await readBooking(request("/policy", undefined, "GET"), context()))
        .status,
    ).toBe(403);
    expect(
      (
        await availability(
          request("/policy/availability?date=2026-10-20", undefined, "GET"),
          context(),
        )
      ).status,
    ).toBe(403);
  });
  it("requires separate health consent and lets only the booked participants read or withdraw it", async () => {
    actor = "api-policy-customer";
    const body = {
      action: "requirements",
      preparationInfo: "Agreed products",
      healthInfo: "Optional relevant private health details",
      healthConsent: false,
      consultationDone: false,
      patchTestDone: false,
    };
    expect(
      (await changePolicy(request("/policy", body), context())).status,
    ).toBe(400);
    expect(
      (
        await changePolicy(
          request("/policy", { ...body, healthConsent: true }),
          context(),
        )
      ).status,
    ).toBe(200);
    actor = "api-policy-pro";
    expect(
      JSON.stringify(
        await (
          await readBooking(request("/policy", undefined, "GET"), context())
        ).json(),
      ),
    ).toContain("Optional relevant private health details");
    actor = "api-policy-admin";
    const overview = await adminOverview(
      request("/api/v1/admin/policies", undefined, "GET"),
    );
    expect(JSON.stringify(await overview.json())).not.toContain(
      "Optional relevant private health details",
    );
    actor = "api-policy-customer";
    expect(
      (
        await changePolicy(
          request("/policy", { action: "withdraw_health" }),
          context(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await (
          await readBooking(request("/policy", undefined, "GET"), context())
        ).json()
      ).requirements.health_info,
    ).toBeNull();
  });
  it("sanitises reference images, prevents foreign access and deletes the actual private image", async () => {
    actor = "api-policy-customer";
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#feccdd" },
    })
      .png()
      .toBuffer();
    expect(
      (
        await uploadPhoto(
          request("/policy/photos", {
            base64: png.toString("base64"),
            altText: "Appointment style reference",
          }),
          context(),
        )
      ).status,
    ).toBe(201);
    const photo = (
      await (
        await readBooking(request("/policy", undefined, "GET"), context())
      ).json()
    ).photos[0].id;
    const path = "/policy/photos?photoId=" + photo;
    actor = "api-policy-other";
    expect(
      (await readPhoto(request(path, undefined, "GET"), context())).status,
    ).toBe(403);
    actor = "api-policy-pro";
    const response = await readPhoto(
      request(path, undefined, "GET"),
      context(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      (await sharp(Buffer.from(await response.arrayBuffer())).metadata())
        .format,
    ).toBe("webp");
    expect(
      (await deletePhoto(request(path, {}, "DELETE"), context())).status,
    ).toBe(403);
    actor = "api-policy-customer";
    expect(
      (await deletePhoto(request(path, {}, "DELETE"), context())).status,
    ).toBe(200);
    expect(
      (await readPhoto(request(path, undefined, "GET"), context())).status,
    ).toBe(404);
  });
});
