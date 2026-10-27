import { afterEach, describe, expect, it, vi } from "vitest";
import {
  socialPostLink,
  preferencesSchema,
} from "@/modules/business-tools/domain";
import { reviewSchema } from "@/modules/reviews/domain";
import { seal, unseal } from "@/modules/business-tools/secrets";
import { beginOAuth, validateOAuthState } from "@/modules/business-tools/oauth";
import {
  publicAddress,
  feedUrl,
  parseFeed,
} from "@/modules/business-tools/ics";
import {
  calendarBusy,
  exportBooking,
} from "@/modules/business-tools/calendars";
import { socialPosts } from "@/modules/business-tools/social";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const token = {
  accessToken: "fixture-access-token",
  expiresAt: Date.now() + 3600000,
};
const from = "2026-10-27T00:00:00Z",
  to = "2026-11-03T00:00:00Z";
describe("official account connections and safe fallbacks", () => {
  it("encrypts with owner/provider binding and rejects altered ciphertext", () => {
    vi.stubEnv("BUSINESS_TOOLS_ENCRYPTION_KEY", "ab".repeat(32));
    const encrypted = seal(token, "owner:google");
    expect(encrypted).not.toContain(token.accessToken);
    expect(unseal(encrypted, "owner:google")).toEqual(token);
    expect(() => unseal(encrypted, "other:google")).toThrow();
    const parts = encrypted.split(".");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => unseal(parts.join("."), "owner:google")).toThrow();
  });
  it("uses state, PKCE and the minimum calendar scope for read-only access", () => {
    vi.stubEnv("BUSINESS_TOOLS_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "fixture");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "fixture-secret");
    vi.stubEnv("GOOGLE_CALENDAR_ENABLED", "true");
    const flow = beginOAuth("google", "alice", "pro", false),
      url = new URL(flow.url);
    expect(url.searchParams.get("scope")).toContain("calendar.events.readonly");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(
      validateOAuthState(
        flow.cookie,
        url.searchParams.get("state")!,
        "google",
        "alice",
      ).professionalId,
    ).toBe("pro");
    expect(() =>
      validateOAuthState(flow.cookie, "forged", "google", "alice"),
    ).toThrow();
    expect(() =>
      validateOAuthState(
        flow.cookie,
        url.searchParams.get("state")!,
        "google",
        "bob",
      ),
    ).toThrow();
  });
  it("rejects unsupported links, script URLs and deceptive subdomains", () => {
    expect(
      socialPostLink("https://www.instagram.com/reel/ABC123/?utm_source=test")
        .url,
    ).toBe("https://www.instagram.com/reel/ABC123/");
    expect(
      socialPostLink("https://www.tiktok.com/@studio/video/12345678").platform,
    ).toBe("tiktok");
    for (const link of [
      "javascript:alert(1)",
      "https://instagram.com.evil.test/p/abc",
      "https://www.instagram.com/profile/",
      "https://evil:pass@instagram.com/p/abc/",
    ])
      expect(() => socialPostLink(link)).toThrow();
    expect(
      preferencesSchema.safeParse({ bufferMinutes: 60, travelBufferMinutes: 0 })
        .success,
    ).toBe(false);
  });
  it("rejects private, loopback and non-global feed destinations", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "fe80::1",
      "2001:db8::1",
    ])
      expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    for (const url of [
      "http://example.com/feed",
      "https://127.0.0.1/calendar",
      "https://user:pass@example.com/feed",
      "https://example.com:444/feed",
    ])
      expect(() => feedUrl(url)).toThrow();
  });
  it("expands recurring ICS appointments, removes cancelled occurrences and exposes no titles", () => {
    const feed =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:private-uid\r\nDTSTART:20261027T120000Z\r\nDTEND:20261027T130000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Private client name\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:private-uid\r\nRECURRENCE-ID:20261028T120000Z\r\nDTSTART:20261028T120000Z\r\nDTEND:20261028T130000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const busy = parseFeed(feed, Date.parse(from), Date.parse(to));
    expect(busy).toHaveLength(2);
    expect(busy.map((b) => b.start)).toEqual([
      "2026-10-27T12:00:00.000Z",
      "2026-10-29T12:00:00.000Z",
    ]);
    expect(JSON.stringify(busy)).not.toMatch(/Private|client|uid/);
  });
  it("handles all-day UK clock changes and rejects missing timezone definitions", () => {
    const allDay =
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:all-day\nDTSTART;VALUE=DATE:20261024\nDTEND;VALUE=DATE:20261026\nEND:VEVENT\nEND:VCALENDAR";
    expect(
      parseFeed(allDay, Date.parse("2026-10-23T00:00Z"), Date.parse(to))[0],
    ).toMatchObject({
      start: "2026-10-23T23:00:00.000Z",
      end: "2026-10-26T00:00:00.000Z",
    });
    expect(() =>
      parseFeed(
        allDay.replace(
          "DTSTART;VALUE=DATE:20261024",
          "DTSTART;TZID=Unknown/Zone:20261024T120000",
        ),
        Date.parse(from),
        Date.parse(to),
      ),
    ).toThrow();
  });
  it("does not silently accept incomplete provider pagination", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            Response.json({ items: [], nextPageToken: "still-more" }),
          ),
        ),
    );
    await expect(
      calendarBusy("google", token, from, to, new Set()),
    ).rejects.toThrow("SYNC_FAILED");
  });
  it("filters free/cancelled Google events and existing exported GLOHAUS events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          items: [
            {
              id: "external",
              start: { dateTime: "2026-10-27T12:00Z" },
              end: { dateTime: "2026-10-27T13:00Z" },
            },
            { id: "own-export" },
            { id: "cancelled", status: "cancelled" },
            { id: "free", transparency: "transparent" },
          ],
        }),
      ),
    );
    expect(
      await calendarBusy("google", token, from, to, new Set(["own-export"])),
    ).toEqual([
      {
        key: "external",
        start: "2026-10-27T12:00:00.000Z",
        end: "2026-10-27T13:00:00.000Z",
      },
    ]);
  });
  it("supports personal Outlook calendarView and rejects pagination to another origin", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      Response.json({
        value: [
          {
            id: "outlook-event",
            showAs: "busy",
            start: {
              dateTime: "2026-10-27T12:00:00.0000000",
              timeZone: "UTC",
            },
            end: { dateTime: "2026-10-27T13:00:00.0000000", timeZone: "UTC" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await calendarBusy("outlook", token, from, to, new Set()),
    ).toHaveLength(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("/me/calendarView?");
    fetcher.mockResolvedValueOnce(
      Response.json({
        value: [],
        "@odata.nextLink": "https://evil.test/steal-token",
      }),
    );
    await expect(
      calendarBusy("outlook", token, from, to, new Set()),
    ).rejects.toThrow("SYNC_FAILED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries Google exports with stable IDs and updates an existing event", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ id: "existing" }));
    vi.stubGlobal("fetch", fetcher);
    const booking = {
      id: "11111111-1111-4111-8111-111111111111",
      starts_at: from,
      ends_at: to,
      status: "confirmed",
    };
    expect(await exportBooking("google", token, booking)).toBe("existing");
    expect(fetcher.mock.calls[1][1].method).toBe("PATCH");
    expect(fetcher.mock.calls[0][1].body).not.toContain("client");
  });
  it("imports genuine social creation dates and original links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          error: { code: "ok" },
          data: {
            videos: [
              {
                id: "12345678",
                share_url: "https://www.tiktok.com/@studio/video/12345678",
                create_time: 1793102400,
                title: "My nail work",
              },
            ],
            has_more: false,
          },
        }),
      ),
    );
    const posts = await socialPosts("tiktok", token);
    expect(posts[0].url).toContain("tiktok.com/@studio");
    expect(posts[0].createdAt).toBe(new Date(1793102400000).toISOString());
  });
  it("allows rating-only reviews but requires explicit photo consent and rejects invented question keys", () => {
    const review = {
      bookingId: "11111111-1111-4111-8111-111111111111",
      rating: 1,
      publicName: "A client",
    };
    expect(reviewSchema.parse(review).body).toBe("");
    expect(
      reviewSchema.safeParse({
        ...review,
        answers: { guaranteed_positive: true },
      }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({
        ...review,
        photo: { base64: "AAAA", altText: "My nails", consent: false },
      }).success,
    ).toBe(false);
  });
});

it("imports a bounded recent TikTok window rather than failing accounts with more history", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      error: { code: "ok" },
      data: {
        videos: [
          {
            share_url: "https://www.tiktok.com/@fixture/video/12345678",
            create_time: 1793016000,
            title: "Fixture",
          },
        ],
        has_more: true,
        cursor: fetcher.mock.calls.length + 1,
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await socialPosts("tiktok", token)).toHaveLength(10);
  expect(fetcher).toHaveBeenCalledTimes(10);
  expect(
    fetcher.mock.calls.every(
      (call) =>
        (call as unknown as [string, RequestInit])[1].signal instanceof
        AbortSignal,
    ),
  ).toBe(true);
});
it("imports a bounded recent Instagram window without following provider-supplied next URLs", async () => {
  vi.stubEnv("INSTAGRAM_API_VERSION", "v25.0");
  const fetcher = vi.fn(async () =>
    Response.json({
      data: [
        {
          permalink: "https://www.instagram.com/p/ABC123/",
          timestamp: "2026-10-26T12:00:00Z",
          media_type: "IMAGE",
        },
      ],
      paging: {
        next: "https://untrusted.example.test/page",
        cursors: { after: String(fetcher.mock.calls.length + 1) },
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await socialPosts("instagram", token)).toHaveLength(10);
  expect(fetcher).toHaveBeenCalledTimes(10);
  expect(
    fetcher.mock.calls.every((call) =>
      String((call as unknown as [string])[0]).startsWith(
        "https://graph.instagram.com/",
      ),
    ),
  ).toBe(true);
});
it("honours an aborted pagination budget before an external request can complete", async () => {
  const { providerJson } = await import("@/modules/business-tools/oauth");
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.signal?.aborted) throw Error("aborted fixture");
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    providerJson("https://open.tiktokapis.com/v2/video/list/", {
      signal: controller.signal,
    }),
  ).rejects.toThrow("aborted fixture");
});
