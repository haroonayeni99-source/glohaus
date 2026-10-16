// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ProfessionalNotificationSettings } from "@/components/professional-notification-settings";
import {
  GET,
  PATCH,
} from "@/app/api/v1/professional/notification-settings/route";
import { POST as push } from "@/app/api/v1/professional/push-subscriptions/route";
import { AccessError } from "@/modules/accounts/domain";
import {
  notificationCategories,
  type NotificationPreference,
} from "@/modules/notifications/preferences";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  roles: ["professional"],
  denied: false,
  schedule: vi.fn(),
}));
vi.mock("@/modules/notifications/schedule", () => ({
  scheduleNotificationDelivery: mocks.schedule,
}));
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => {
    if (mocks.denied) throw new AccessError("UNAUTHENTICATED", 401);
    return { authId: "pro", secondFactorAge: 0 };
  },
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async (_id: string, work: (db: object) => unknown) =>
    work({ query: mocks.query }),
}));
vi.mock("@/modules/accounts/repository", () => ({
  findAccount: async () => ({
    id: "user",
    authId: "pro",
    professionalId: "profile",
    status: "active",
    roles: mocks.roles,
  }),
}));
vi.mock("next/link", () => ({
  default: (props: object) => React.createElement("a", props),
}));
let root: Root,
  container: HTMLDivElement,
  preferences: NotificationPreference[];
const request = (body: unknown, origin = "https://glohaus.test") =>
  new Request(
    "https://glohaus.test/api/v1/professional/notification-settings",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
const check = (category: string, channel: "Email" | "Push") =>
  Array.from(container.querySelectorAll<HTMLInputElement>("input")).find(
    (input) =>
      input
        .closest("label")
        ?.textContent?.toLowerCase()
        .includes(category.toLowerCase() + " " + channel.toLowerCase()),
  )!;
async function render() {
  await act(async () =>
    root.render(
      React.createElement(ProfessionalNotificationSettings, {
        initial: { preferences, devices: [] },
        pushConfigured: false,
        publicKey: null,
      }),
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.roles = ["professional"];
  mocks.denied = false;
  preferences = notificationCategories.map((category) => ({
    category,
    email: category !== "promotions",
    push: false,
  }));
  mocks.query.mockImplementation(async (sql, args) => {
    if (sql.includes("set_notification_preference")) {
      preferences = preferences.map((p) =>
        p.category === args[0]
          ? { category: args[0], email: args[1], push: args[2] }
          : p,
      );
    }
    return { rows: [{ data: { preferences, devices: [] } }] };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      init?.method === "PATCH"
        ? PATCH(request(JSON.parse(String(init.body))))
        : GET(),
    ),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("saves email and push independently through real strict API handlers and restores choices after remount", async () => {
  await render();
  expect(check("New bookings", "Email").disabled).toBe(true);
  expect(check("Customer messages", "Email").checked).toBe(true);
  await act(async () => check("Customer messages", "Push").click());
  expect(check("Customer messages", "Push").checked).toBe(true);
  expect(check("Customer messages", "Email").checked).toBe(true);
  await act(async () => check("Customer messages", "Email").click());
  expect(check("Customer messages", "Email").checked).toBe(false);
  expect(container.textContent).toContain("Notification preferences saved.");
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(check("Customer messages", "Push").checked).toBe(true);
  expect(check("Customer messages", "Email").checked).toBe(false);
});
it("retains saved values and exposes a recoverable error on failed saves", async () => {
  await render();
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 503 }));
  await act(async () => check("Customer messages", "Push").click());
  expect(check("Customer messages", "Push").checked).toBe(false);
  expect(container.querySelector("[role=alert]")?.textContent).toContain(
    "Could not save",
  );
});
it("rejects cross-origin requests, extra identity fields and disabling essential email", async () => {
  expect(
    (await PATCH(request({ category: "bookings", email: false, push: false })))
      .status,
  ).toBe(400);
  expect(
    (
      await PATCH(
        request({
          category: "messages",
          email: true,
          push: true,
          user_id: "victim",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await PATCH(
        request(
          { category: "messages", email: true, push: true },
          "https://evil.test",
        ),
      )
    ).status,
  ).toBe(403);
  mocks.roles = ["customer"];
  expect((await GET()).status).toBe(403);
  mocks.denied = true;
  expect((await GET()).status).toBe(401);
});
it("does not expose private VAPID keys, and authenticates push operations before configuration errors", async () => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-safe");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-never-return");
  vi.stubEnv("VAPID_SUBJECT", "mailto:support@glohaus.shop");
  const response = await GET();
  expect(JSON.stringify(await response.json())).not.toContain(
    "private-never-return",
  );
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  mocks.denied = true;
  expect(
    (
      await push(
        request({ id: "11111111-1111-4111-8111-111111111111", action: "test" }),
      )
    ).status,
  ).toBe(401);
  mocks.denied = false;
  expect(
    (
      await push(
        request({ id: "11111111-1111-4111-8111-111111111111", action: "test" }),
      )
    ).status,
  ).toBe(503);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
