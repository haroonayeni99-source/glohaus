import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), query: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({ withOwner: mocks.owner }));
import { GET, POST } from "@/app/api/v1/admin/support/operations/route";
import { AccessError } from "@/modules/accounts/domain";
const id = "11111111-1111-4111-8111-111111111111";
const payload = {
  id,
  kind: "access",
  identity: "verified",
  holdReason: "",
  nextReviewAt: "",
  receivedOn: "2026-10-25",
  reason: "Verified existing account information proportionately",
};
const request = (
  body: unknown = payload,
  origin = "https://www.glohaus.shop",
) =>
  new Request("https://www.glohaus.shop/api/v1/admin/support/operations", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockImplementation((work: (db: object) => unknown) =>
    work({ query: mocks.query }),
  );
  mocks.query.mockResolvedValue({
    rows: [{ data: { rightsPending: 0, items: [] } }],
  });
});
it("does not expose private review data without Owner MFA", async () => {
  mocks.owner.mockRejectedValue(new AccessError("FORBIDDEN", 403));
  expect(
    (
      await GET(
        new Request("https://www.glohaus.shop/api/v1/admin/support/operations"),
      )
    ).status,
  ).toBe(403);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("validates case IDs and never caches the private queue", async () => {
  expect(
    (
      await GET(
        new Request(
          "https://www.glohaus.shop/api/v1/admin/support/operations?caseId=bad",
        ),
      )
    ).status,
  ).toBe(400);
  expect(mocks.owner).not.toHaveBeenCalled();
  const response = await GET(
    new Request(
      `https://www.glohaus.shop/api/v1/admin/support/operations?caseId=${id}`,
    ),
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT beauty.owner_support_operations($1) AS data",
    [id],
  );
});
it("rejects cross-origin writes, extra fields and oversized bodies before database access", async () => {
  expect(
    (await POST(request(payload, "https://other.example.test"))).status,
  ).toBe(403);
  expect((await POST(request({ ...payload, deleteData: true }))).status).toBe(
    400,
  );
  expect(
    (await POST(request({ ...payload, reason: "x".repeat(5000) }))).status,
  ).toBe(413);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("accepts maximum-length justified review fields without silently truncating", async () => {
  const valid = {
    ...payload,
    holdReason: "a".repeat(500),
    reason: "b".repeat(500),
    nextReviewAt: "2026-11-01",
  };
  expect((await POST(request(valid))).status).toBe(200);
  expect(JSON.parse(mocks.query.mock.calls[0][1][1])).toEqual(valid);
});
it("returns validation errors without disclosing SQL or case contents", async () => {
  mocks.query.mockRejectedValue({
    code: "22023",
    message: "HOLD_REVIEW_REQUIRED",
  });
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
});
