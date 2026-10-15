/** Real route handlers + all SQL migrations/RLS. Identity and Stripe are isolated provider fixtures. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import type { SqlClient } from "@/modules/accounts/repository";
import { findAccount } from "@/modules/accounts/repository";
import {
  publicProfile,
  discoveryPage,
} from "@/modules/professionals/repository";
import { professionalSetupProgress } from "@/modules/professionals/setup";
import { professionalDashboard } from "@/modules/dashboard/repository";
import {
  professionalWallet,
  customerPaymentOverview,
} from "@/modules/finance/repository";
import { adminOverview, ownerControls } from "@/modules/admin/repository";
import { GET as requirements } from "@/app/api/v1/professional/connect/route";
import { POST as enrol } from "@/app/api/v1/accounts/enrol/route";
import { PUT as profile } from "@/app/api/v1/professional/profile/route";
import { POST as service } from "@/app/api/v1/professional/services/route";
import { PUT as availability } from "@/app/api/v1/professional/availability/route";
import { POST as reserve } from "@/app/api/v1/bookings/route";
import { PATCH as complete } from "@/app/api/v1/bookings/[id]/route";
import { POST as startMessage } from "@/app/api/v1/messages/route";
import {
  POST as reply,
  GET as messages,
} from "@/app/api/v1/messages/[id]/route";
import { POST as review } from "@/app/api/v1/reviews/route";
import { POST as category } from "@/app/api/v1/admin/categories/route";
import { POST as manage } from "@/app/api/v1/admin/manage/route";
import { POST as webhook } from "@/app/api/webhooks/stripe/route";

const db = await createTestDatabase();
let actor = "pro";
let mfa: number | null = 0;
let providerEvent: unknown;
let checkout: {
  cancel_url: string;
  success_url: string;
  metadata: { booking_id: string };
  line_items: { price_data: { unit_amount: number }; quantity: number }[];
};
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => ({
    authId: actor,
    email: `${actor}@example.test`,
    displayName: actor,
    secondFactorAge: mfa,
  }),
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async <T>(
    authId: string,
    work: (sql: SqlClient) => Promise<T>,
  ) => asUser(authId, work),
}));
vi.mock("@/modules/payments/worker", () => ({
  withPaymentWorker: async <T>(work: (sql: SqlClient) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE beauty_payment_worker");
      return work(tx);
    }),
}));
vi.mock("@/modules/payments/stripe", () => ({
  paymentReady: () => true,
  stripe: () => ({
    checkout: {
      sessions: {
        create: async (input: typeof checkout) => {
          checkout = input;
          return {
            id: "cs_isolated_journey",
            url: "https://checkout.example.test/isolated",
          };
        },
        expire: async () => ({}),
      },
    },
    accounts: {
      retrieve: async () => ({
        id: "acct_isolated_journey",
        email: "private@example.test",
        external_accounts: { data: [{ account_number: "never-return" }] },
        requirements: {
          currently_due: ["individual.verification.document"],
          past_due: [],
          pending_verification: ["person_privateid.first_name"],
          current_deadline: null,
        },
      }),
    },
    webhooks: { constructEvent: () => providerEvent },
  }),
}));
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}
const origin = "https://glohaus.example.test";
function request(path: string, body: unknown, method = "POST") {
  return new Request(`${origin}${path}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function expectSaved(response: Response, status = 200) {
  expect(
    await response.clone().json(),
    `HTTP ${response.status}`,
  ).not.toHaveProperty("error");
  expect(response.status).toBe(status);
  return response.json();
}
async function deliver(event: unknown) {
  providerEvent = event;
  const response = await webhook(
    new Request(`${origin}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "stripe-signature": "isolated-provider-fixture" },
      body: "fixture",
    }),
  );
  expect(response.status, await response.text()).toBe(200);
}
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_isolated_test_only");
  await applyTestMigrations(db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});
let professionalId: string;
let customerId: string;
let bookingId: string;
let conversationId: string;
let reviewId: string;
describe.sequential(
  "Complete marketplace journeys with isolated providers",
  () => {
    it("enrols a professional, publishes a profile, verifies, adds services and availability", async () => {
      await expectSaved(
        await enrol(
          request("/api/v1/accounts/enrol", {
            role: "professional",
            adultConfirmed: true,
            professionalTermsAccepted: true,
          }),
        ),
      );
      const account = await asUser("pro", (sql) => findAccount(sql, "pro"));
      professionalId = account!.professionalId!;
      expect(await expectSaved(await requirements())).toMatchObject({
        started: false,
      });
      expect(
        await asUser("pro", (sql) =>
          professionalSetupProgress(sql, professionalId),
        ),
      ).toMatchObject({
        profile: false,
        services: false,
        availability: false,
        portfolio: false,
        published: false,
      });
      await expectSaved(
        await profile(
          request(
            "/api/v1/professional/profile",
            {
              slug: "journey-studio",
              businessName: "Journey Studio",
              bio: "Independent beauty appointments with a friendly nail artist.",
              city: "Brixton",
              category: "Nails",
              publicationStatus: "published",
            },
            "PUT",
          ),
        ),
      );
      await asUser("pro", (sql) =>
        sql.query(
          "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_isolated_journey')",
          [professionalId],
        ),
      );
      await deliver({
        id: "evt_verified_journey",
        type: "account.updated",
        data: {
          object: {
            id: "acct_isolated_journey",
            capabilities: { transfers: "active" },
            payouts_enabled: true,
          },
        },
      });
      const remaining = await expectSaved(await requirements());
      expect(remaining).toEqual({
        started: true,
        due: ["individual verification document"],
        overdue: [],
        pending: ["person first name"],
        deadline: null,
      });
      expect(JSON.stringify(remaining)).not.toContain("private@example.test");
      const taxonomyFields=(await db.query<{categoryId:string;specialityId:string;templateId:string}>(`SELECT s.category_id AS "categoryId",s.id AS "specialityId",t.id AS "templateId" FROM beauty.service_templates t JOIN beauty.specialities s ON s.id=t.speciality_id WHERE t.slug='gel-polish'`)).rows[0];
      await asUser("pro",sql=>sql.query("SELECT beauty.save_my_specialities($1,$2,$3)",[[taxonomyFields.categoryId],[taxonomyFields.specialityId],taxonomyFields.specialityId]));
      await expectSaved(
        await service(
          request("/api/v1/professional/services", {
            ...taxonomyFields,
            name: "Gel manicure",
            description: "A fresh gel manicure",
            durationMinutes: 60,
            pricePence: 4500,
            depositPence: 1500,
            active: true,
            category: "Nails",
          }),
        ),
        201,
      );
      await expectSaved(
        await availability(
          request(
            "/api/v1/professional/availability",
            {
              rules: Array.from({ length: 7 }, (_, weekday) => ({
                weekday,
                startMinute: 480,
                endMinute: 1200,
              })),
            },
            "PUT",
          ),
        ),
      );
      expect(
        await asUser("pro", (sql) =>
          professionalSetupProgress(sql, professionalId),
        ),
      ).toMatchObject({
        profile: true,
        services: true,
        availability: true,
        portfolio: false,
        published: true,
      });
    });
    it("enrols a customer, combines discovery filters, books and confirms a simulated payment exactly once", async () => {
      actor = "customer";
      await expectSaved(
        await enrol(request("/api/v1/accounts/enrol", { role: "customer" })),
      );
      customerId = (await asUser(actor, (sql) => findAccount(sql, actor)))!.id;
      expect((await requirements()).status).toBe(403);
      const directory = await asUser("", (sql) =>
        discoveryPage(sql, "", undefined, {
          location: "Brixton",
          category: "Nails",
          maxPricePence: 5000,
          verified: true,
          under50: false,
          topRated: false,
          travels: false,
          availableToday: false,
        }),
      );
      expect(directory.professionals.map((p) => p.slug)).toContain(
        "journey-studio",
      );
      expect(
        (
          await asUser("", (sql) =>
            discoveryPage(sql, "", undefined, {
              location: "Soho",
              verified: false,
              under50: false,
              topRated: false,
              travels: false,
              availableToday: false,
            }),
          )
        ).professionals,
      ).toHaveLength(0);
      const selected = await asUser("", (sql) =>
        publicProfile(sql, "journey-studio"),
      );
      const date = new Date(Date.now() + 2 * 86400000);
      date.setUTCHours(12, 0, 0, 0);
      const bookingRequest = request("/api/v1/bookings", {
        serviceId: selected!.services[0].id,
        startsAt: date.toISOString(),
        acceptPolicy: true,
        earlyServiceRequested:true,
        policyToken:await asUser(actor,async sql=>(await sql.query<{token:string}>("SELECT beauty.public_service_policy($1)->>'token' AS token",[selected!.services[0].id])).rows[0].token),
      });
      bookingRequest.headers.set("referer", `${origin}/p/journey-studio`);
      const result = await expectSaved(
        await reserve(bookingRequest),
        201,
      );
      bookingId = result.bookingId;
      expect(result.url).toBe("https://checkout.example.test/isolated");
      expect(checkout.metadata.booking_id).toBe(bookingId);
      expect(checkout.cancel_url).toBe(`${origin}/p/journey-studio#booking`);
      expect(checkout.success_url).toBe(`${origin}/account/bookings/${bookingId}`);
      const amount = checkout.line_items.reduce(
        (sum, item) => sum + item.price_data.unit_amount * item.quantity,
        0,
      );
      expect(amount).toBe(1600);
      const event = {
        id: "evt_paid_journey",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_isolated_journey",
            metadata: { booking_id: bookingId },
            payment_status: "paid",
            mode: "payment",
            payment_intent: "pi_isolated_journey",
            amount_total: amount,
            currency: "gbp",
          },
        },
      };
      await deliver(event);
      await deliver(event);
      const payments = await asUser(actor, (sql) =>
        customerPaymentOverview(sql, customerId),
      );
      expect(payments.records).toHaveLength(1);
      expect(payments.records[0]).toMatchObject({
        bookingStatus: "confirmed",
        capturedPence: 1600,
      });
      actor = "pro";
      const dashboard = await asUser(actor, (sql) =>
        professionalDashboard(sql, professionalId),
      );
      expect(dashboard.upcoming.map((b) => b.id)).toContain(bookingId);
    });
    it("exchanges messages visible to both participants, with outsider access denied", async () => {
      actor = "customer";
      const conversation = await expectSaved(
        await startMessage(
          request("/api/v1/messages", {
            bookingId,
            body: "Hello, can you confirm the appointment details?",
          }),
        ),
        201,
      );
      conversationId = conversation.conversationId;
      actor = "pro";
      await expectSaved(
        await reply(
          request(`/api/v1/messages/${conversationId}`, {
            body: "Yes, your appointment is confirmed. See you soon!",
            bookingId,
          }),
          { params: Promise.resolve({ id: conversationId }) },
        ),
        201,
      );
      for (const participant of ["customer", "pro"]) {
        actor = participant;
        const response = await messages(
          new Request(`${origin}/api/v1/messages/${conversationId}`),
          { params: Promise.resolve({ id: conversationId }) },
        );
        const history = await expectSaved(response);
        expect(
          history.messages
            .map((m: { sender_role: string }) => m.sender_role)
            .sort(),
        ).toEqual(["customer", "professional"]);
      }
      actor = "outsider";
      await expectSaved(
        await enrol(request("/api/v1/accounts/enrol", { role: "customer" })),
      );
      expect(
        (
          await messages(
            new Request(`${origin}/api/v1/messages/${conversationId}`),
            { params: Promise.resolve({ id: conversationId }) },
          )
        ).status,
      ).toBe(403);
    });
    it("completes an elapsed appointment, accepts only its customer's review, and exposes the professional wallet", async () => {
      // Local test clock fixture only: move this isolated booking into the past.
      await db.query(
        "UPDATE beauty.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",
        [bookingId],
      );
      actor = "customer";
      expect(
        (
          await complete(
            request(
              `/api/v1/bookings/${bookingId}`,
              { status: "completed", reason: "Service delivered" },
              "PATCH",
            ),
            { params: Promise.resolve({ id: bookingId }) },
          )
        ).status,
      ).toBe(409);
      actor = "pro";
      await expectSaved(
        await complete(
          request(
            `/api/v1/bookings/${bookingId}`,
            { status: "completed", reason: "Service delivered" },
            "PATCH",
          ),
          { params: Promise.resolve({ id: bookingId }) },
        ),
      );
      actor = "customer";
      await expectSaved(
        await review(
          request("/api/v1/reviews", {
            bookingId,
            rating: 5,
            body: "A lovely manicure and a very professional appointment.",
            publicName: "Customer",
          }),
        ),
        201,
      );
      reviewId = (
        await db.query<{ id: string }>(
          "SELECT id FROM beauty.reviews WHERE booking_id=$1",
          [bookingId],
        )
      ).rows[0].id;
      actor = "pro";
      const wallet = await asUser(actor, (sql) => professionalWallet(sql));
      expect(wallet.pendingPence + wallet.availablePence).toBeGreaterThan(0);
      expect(
        (await asUser("", (sql) => publicProfile(sql, "journey-studio")))
          ?.professional.business_name,
      ).toBe("Journey Studio");
    });
    it("lets the verified owner inspect users, manage statuses/categories, inspect disputes and audit decisions", async () => {
      actor = "owner";
      await expectSaved(
        await enrol(request("/api/v1/accounts/enrol", { role: "customer" })),
      );
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) SELECT id,'admin' FROM beauty.users WHERE auth_id='owner'",
      );
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) SELECT id,'owner' FROM beauty.users WHERE auth_id='owner'",
      );
      const before = await adminOverview();
      expect(before.users.map((user) => user.id)).toContain(customerId);
      expect(before.bookings?.map((b) => b.id)).toContain(bookingId);
      expect(before.bookingDisputes).toEqual([]);
      await expectSaved(
        await category(
          request("/api/v1/admin/categories", {
            name: "Journey beauty",
            slug: "journey-beauty",
            active: true,
            sortOrder: 99,
            reason: "Isolated journey category",
          }),
        ),
      );
      await expectSaved(
        await manage(
          request("/api/v1/admin/manage", {
            type: "user",
            id: customerId,
            status: "suspended",
            reason: "Isolated status inspection",
          }),
        ),
      );
      expect(
        (await adminOverview()).users.find((u) => u.id === customerId)?.status,
      ).toBe("suspended");
      await expectSaved(
        await manage(
          request("/api/v1/admin/manage", {
            type: "user",
            id: customerId,
            status: "active",
            reason: "Restore isolated customer",
          }),
        ),
      );
      await expectSaved(
        await manage(
          request("/api/v1/admin/manage", {
            type: "review",
            id: reviewId,
            status: "hidden",
            reason: "Isolated moderation test",
          }),
        ),
      );
      expect((await ownerControls()).audit.length).toBeGreaterThan(0);
      mfa = null;
      expect(
        (
          await category(
            request("/api/v1/admin/categories", {
              name: "Denied",
              slug: "denied",
              active: true,
              sortOrder: 99,
              reason: "Unverified owner test",
            }),
          )
        ).status,
      ).toBe(403);
      mfa = 0;
    });
  },
);
