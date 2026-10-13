import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ booking: vi.fn(), account: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/page-access", () => ({ pageAccount: mocks.account }));
vi.mock("@/lib/db", () => ({
  withIdentity: (_id: string, work: (db: object) => unknown) =>
    work({ query: async () => ({ rows: [] }) }),
}));
vi.mock("@/modules/bookings/repository", () => ({
  bookingById: mocks.booking,
}));
import BookingPage from "@/app/account/bookings/[id]/page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({
    account: { authId: "current-customer", professionalId: null },
  });
  mocks.booking.mockResolvedValue(null);
});
const params = Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" });
it.each(["cancelled", "returned"])(
  "takes an unavailable %s checkout return to the current customer's booking list",
  async (checkout) => {
    await expect(
      BookingPage({ params, searchParams: Promise.resolve({ checkout }) }),
    ).rejects.toThrow("REDIRECT:/account/bookings");
  },
);
it.each([undefined, "success"])(
  "preserves privacy for unrelated missing booking links (%s)",
  async (checkout) => {
    await expect(
      BookingPage({ params, searchParams: Promise.resolve({ checkout }) }),
    ).rejects.toThrow("NOT_FOUND");
  },
);
