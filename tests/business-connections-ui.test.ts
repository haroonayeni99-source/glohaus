// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BusinessConnections } from "@/components/business-connections";
const m = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock("next/link", () => ({
  default: (p: object) => React.createElement("a", p),
}));
const connection = {
  id: "00000000-0000-4000-8000-000000000001",
  provider: "tiktok",
  label: "TikTok",
  status: "connected",
  last_success_at: null,
  last_error: null,
  social_mode: "approval",
  sync_enabled: true,
  auto_publish: false,
  export_bookings: false,
} as const;
const props = {
  connections: [connection],
  posts: [],
  preferences: { buffer_minutes: 0, travel_buffer_minutes: 0 },
  ready: {
    google: false,
    outlook: false,
    ics: true,
    instagram: false,
    tiktok: true,
  },
  services: [],
};
let cleanup = async () => {};
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function setup(fetcher: unknown) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () =>
    root.render(React.createElement(BusinessConnections, props)),
  );
  return { host, root };
}
const button = (h: HTMLElement, text: string) =>
  [...h.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
it("announces progress immediately and prevents repeated requests until response", async () => {
  let done!: (v: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((r) => (done = r)));
  const { host } = await setup(fetcher);
  await act(async () => {
    button(host, "Refresh public videos").click();
    button(host, "Refresh public videos").click();
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(host.querySelector("[role=status]")?.textContent).toContain(
    "Updating",
  );
  expect(button(host, "Working").disabled).toBe(true);
  await act(async () => done(Response.json({ synced: 1, failed: 0 })));
  expect(host.querySelector("[role=status]")?.textContent).toContain(
    "Refresh complete",
  );
  expect(m.refresh).toHaveBeenCalledOnce();
});
it.each([
  [{ synced: 0, failed: 0 }, "No refresh ran"],
  [{ synced: 0, failed: 1 }, "Sync needs attention"],
])(
  "does not announce skipped or failed sync as saved",
  async (data, message) => {
    const { host } = await setup(vi.fn(async () => Response.json(data)));
    await act(async () => button(host, "Refresh public videos").click());
    expect(host.querySelector("[role=status]")?.textContent).toContain(message);
  },
);
it("explains expired sessions and non-JSON failures without leaking responses", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
    )
    .mockResolvedValueOnce(
      new Response("private provider diagnostics", { status: 502 }),
    );
  const { host } = await setup(fetcher);
  await act(async () => button(host, "Refresh public videos").click());
  expect(host.textContent).toContain("session has expired");
  await act(async () => button(host, "Refresh public videos").click());
  expect(host.textContent).toContain("unexpected response");
  expect(host.textContent).not.toContain("private provider diagnostics");
});
it("reconciles refreshed post status after removing an imported post", async () => {
  const { host, root } = await setup(
    vi.fn(async () => Response.json({ saved: true })),
  );
  const post = {
    id: "post",
    platform: "tiktok",
    original_url: "https://www.tiktok.com/@test/video/123456",
    caption: "Test",
    source_created_at: null,
    publication_status: "draft",
    source_available: true,
    service_id: null,
    sort_order: 0,
    featured: false,
  } as const;
  await act(async () =>
    root.render(
      React.createElement(BusinessConnections, {
        ...props,
        posts: [post as never],
      }),
    ),
  );
  await act(async () => button(host, "Remove from display").click());
  expect(host.textContent).toContain("Removed from public display");
  await act(async () =>
    root.render(
      React.createElement(BusinessConnections, {
        ...props,
        posts: [{ ...post, publication_status: "hidden" } as never],
      }),
    ),
  );
  expect(
    host.querySelector<HTMLSelectElement>("select[name=status]")?.value,
  ).toBe("hidden");
});

it("sends selected publication settings and explains a profile that is not public yet", async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => {
    void _url; void _init; return Response.json({ saved: true });
  },
  );
  const { host, root } = await setup(fetcher);
  const post = {
    id: "00000000-0000-4000-8000-000000000002",
    platform: "tiktok",
    original_url: "https://www.tiktok.com/@test/video/123456",
    caption: "Work",
    source_created_at: null,
    publication_status: "draft",
    source_available: true,
    service_id: null,
    sort_order: 0,
    featured: false,
  };
  await act(async () =>
    root.render(
      React.createElement(BusinessConnections, {
        ...props,
        posts: [post as never],
        portfolio: {
          max_visible_posts: 12,
          instagram_url: "",
          tiktok_url: "",
          sync_allowed: true,
          public_profile_ready: false,
        },
      }),
    ),
  );
  expect(host.textContent).toContain(
    "complete and publish your professional profile",
  );
  const select = host.querySelector<HTMLSelectElement>("select[name=status]")!;
  select.value = "published";
  await act(async () => button(host, "Save post").click());
  expect(fetcher.mock.calls[0][0]).toBe("/api/v1/professional/social");
  const options = fetcher.mock.calls[0][1] as RequestInit;
  expect(options.method).toBe("PUT");
  expect(JSON.parse(String(options.body))).toMatchObject({
    id: post.id,
    publicationStatus: "published",
    serviceId: null,
  });
});
it.each([
  ["network", "Could not reach GLOHAUS"],
  ["timeout", "took too long"],
])("recovers controls after %s failure", async (kind, message) => {
  const error =
    kind === "network"
      ? new TypeError("fetch failed")
      : new DOMException("expired", "TimeoutError");
  const { host } = await setup(
    vi.fn(async () => {
      throw error;
    }),
  );
  await act(async () => button(host, "Refresh public videos").click());
  expect(host.textContent).toContain(message);
  expect(button(host, "Refresh public videos").disabled).toBe(false);
});
