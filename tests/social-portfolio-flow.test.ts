import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import sharp from "sharp";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { saveSchedule } from "@/modules/availability/repository";
const io = vi.hoisted(() => ({
  identity: vi.fn(),
  run: vi.fn(),
  worker: vi.fn(),
  thumbnail: vi.fn(),
}));
vi.mock("@/lib/identity", () => ({ getIdentity: io.identity }));
vi.mock("@/lib/db", () => ({ withIdentity: io.run }));
vi.mock("@/modules/payments/worker", () => ({ withPaymentWorker: io.worker }));
vi.mock("@/modules/business-tools/public-fetch", async (original) => ({
  ...(await original<typeof import("@/modules/business-tools/public-fetch")>()),
  fetchPublicBytes: io.thumbnail,
}));
import {
  storeConnection,
  syncProfessional,
  publicSocialPosts,
} from "@/modules/business-tools/repository";
import { runBusinessToolsWorker } from "@/modules/business-tools/worker";
import { PUT as updateSocial } from "@/app/api/v1/professional/social/route";
import { GET as readThumbnail } from "@/app/api/v1/social-thumbnails/[id]/route";
import {
  GET as ownerOverview,
  POST as ownerSettings,
} from "@/app/api/v1/admin/social-sync/route";
import {
  socialProfileLink,
  socialThumbnailUrl,
} from "@/modules/business-tools/domain";
const db = await createTestDatabase();
let pro: string, otherPro: string, service: string;
let source = ["AAA123", "BBB123"];
const actor = (id: string, age: number | null = 0) => ({
  authId: id,
  email: `${id}@example.test`,
  displayName: id,
  secondFactorAge: age,
});
async function as<T>(id: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified','false',true)",
      [id],
    );
    return work(tx);
  });
}
async function owner(enabled: boolean, target: string | null = null) {
  return as("social-owner", async (sql) => {
    await sql.query("SELECT set_config('app.admin_verified','true',true)");
    return sql.query(
      "SELECT beauty.owner_social_sync_settings($1,$2,'Isolated fixture setting')",
      [target, enabled],
    );
  });
}
async function connect(
  mode = "approval",
  provider: "instagram" | "tiktok" = "instagram",
) {
  const row = await as("social-pro", (sql) =>
    storeConnection(sql, pro, provider, provider, {
      accessToken: "fixture-access",
      expiresAt: Date.now() + 3600000,
    }),
  );
  await as("social-pro", (sql) =>
    sql.query(
      "UPDATE beauty.business_connections SET social_mode=$2 WHERE id=$1",
      [row.id, mode],
    ),
  );
  return row.id;
}
const refresh = (id?: string) => syncProfessional("social-pro", pro, id);
const visible = () => as("", (sql) => publicSocialPosts(sql, pro));
const request = (body: unknown, path = "/api/v1/professional/social") =>
  new Request(`https://www.glohaus.shop${path}`, {
    method: "PUT",
    headers: {
      Origin: "https://www.glohaus.shop",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const network = vi.fn(async () =>
  Response.json({
    data: source.map((id, index) => ({
      id: `provider-${id}`,
      permalink: `https://www.instagram.com/p/${id}/`,
      caption: `Fictional result ${id}`,
      timestamp: `2026-10-${26 - index}T12:00:00Z`,
      media_type: index ? "CAROUSEL_ALBUM" : "IMAGE",
      media_url: `https://scontent.cdninstagram.com/${id}.jpg`,
    })),
  }),
);
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const id of [
    "social-pro",
    "social-other-pro",
    "social-customer",
    "social-admin",
    "social-owner",
  ]) {
    await as(id, async (sql) => {
      const a = await enrolAccount(
        sql,
        actor(id),
        id.includes("pro") ? "professional" : "customer",
      );
      if (id === "social-pro") pro = a.professionalId!;
      if (id === "social-other-pro") otherPro = a.professionalId!;
    });
  }
  for (const role of ["admin", "owner"])
    await db.query(
      "INSERT INTO beauty.user_roles(user_id,role) SELECT id,$2 FROM beauty.users WHERE auth_id=$1",
      [`social-${role}`, role],
    );
  await as("social-pro", async (sql) => {
    await updateProfile(sql, pro, {
      slug: "social-fixture",
      businessName: "Social fixture",
      bio: "Fictional studio for isolated portfolio synchronisation checks.",
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
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_social_fixture')",
      [pro],
    );
  });
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    await tx.query(
      "SELECT beauty.sync_connect_account('acct_social_fixture',true),beauty.sync_connect_verification('acct_social_fixture',true)",
    );
  });
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("BUSINESS_TOOLS_ENCRYPTION_KEY", "cd".repeat(32));
  for (const key of ["INSTAGRAM", "TIKTOK"]) {
    vi.stubEnv(`${key}_CLIENT_ID`, "fixture-app");
    vi.stubEnv(`${key}_CLIENT_SECRET`, "fixture-secret");
    vi.stubEnv(`${key}_ENABLED`, "true");
  }
  vi.stubEnv("INSTAGRAM_API_VERSION", "v25.0");
  io.run.mockImplementation(as);
  io.identity.mockResolvedValue(actor("social-pro"));
  io.worker.mockImplementation((work: (sql: SqlClient) => Promise<unknown>) =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE beauty_payment_worker");
      return work(tx);
    }),
  );
  source = ["AAA123", "BBB123"];
  network.mockReset();
  network.mockImplementation(async () =>
    Response.json({
      data: source.map((id, index) => ({
        id: `provider-${id}`,
        permalink: `https://www.instagram.com/p/${id}/`,
        caption: `Fictional result ${id}`,
        timestamp: `2026-10-${26 - index}T12:00:00Z`,
        media_type: index ? "CAROUSEL_ALBUM" : "IMAGE",
        media_url: `https://scontent.cdninstagram.com/${id}.jpg`,
      })),
    }),
  );
  vi.stubGlobal("fetch", network);
  await db.exec(
    "TRUNCATE beauty.business_connections CASCADE; DELETE FROM beauty.social_portfolio_preferences; DELETE FROM beauty.social_sync_controls; UPDATE beauty.social_sync_settings SET enabled=true;",
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => db.close());
it("imports authorised work as approval drafts and prevents duplicates on repeated refresh", async () => {
  const id = await connect();
  expect(await refresh(id)).toEqual({ synced: 1, failed: 0 });
  expect(await visible()).toEqual([]);
  expect(await refresh(id)).toEqual({ synced: 1, failed: 0 });
  const rows = (
    await db.query<{
      media_type: string;
      publication_status: string;
      thumbnail_url: string;
    }>("SELECT * FROM beauty.social_portfolio")
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows.every((p) => p.publication_status === "draft")).toBe(true);
  expect(rows[1].media_type).toBe("carousel");
  expect(rows[0].thumbnail_url).toContain("cdninstagram.com");
});
it("publishes new automatic-mode work in genuine chronological order", async () => {
  const id = await connect("automatic");
  await refresh(id);
  const posts = await visible();
  expect(posts.map((p) => p.original_url)).toEqual([
    "https://www.instagram.com/p/AAA123/",
    "https://www.instagram.com/p/BBB123/",
  ]);
  expect(posts.every((p) => p.has_thumbnail)).toBe(true);
  expect(JSON.stringify(posts)).not.toMatch(
    /thumbnail_url|fixture-access|fixture-secret/,
  );
});
it("preserves hidden posts across deletion, privacy changes and later reappearance", async () => {
  const id = await connect("automatic");
  await refresh(id);
  await as("social-pro", (sql) =>
    sql.query(
      "UPDATE beauty.social_portfolio SET publication_status='hidden' WHERE external_id='AAA123'",
    ),
  );
  source = ["BBB123"];
  await refresh(id);
  source = ["AAA123", "BBB123"];
  await refresh(id);
  expect((await visible()).map((p) => p.original_url)).toEqual([
    "https://www.instagram.com/p/BBB123/",
  ]);
  const hidden = (
    await db.query<{ publication_status: string; source_available: boolean }>(
      "SELECT publication_status,source_available FROM beauty.social_portfolio WHERE external_id='AAA123'",
    )
  ).rows[0];
  expect(hidden).toEqual({
    publication_status: "hidden",
    source_available: true,
  });
});
it("removes missing source content and its thumbnail from all public views", async () => {
  const id = await connect("automatic");
  await refresh(id);
  source = [];
  await refresh(id);
  expect(await visible()).toEqual([]);
  expect(
    (
      await as("", (sql) =>
        sql.query("SELECT * FROM beauty.public_social_thumbnails"),
      )
    ).rows,
  ).toEqual([]);
});
it("keeps manual mode and professional-disabled syncing out of the scheduled queue while allowing an explicit refresh", async () => {
  const id = await connect("manual");
  expect(await refresh()).toEqual({ synced: 0, failed: 0 });
  expect(await runBusinessToolsWorker()).toMatchObject({
    synced: 0,
    failed: 0,
  });
  expect(network).not.toHaveBeenCalled();
  await refresh(id);
  expect(network).toHaveBeenCalledOnce();
  expect(await visible()).toEqual([]);
  await as("social-pro", (sql) =>
    sql.query(
      "UPDATE beauty.business_connections SET social_mode='automatic',sync_enabled=false,next_sync_at=now() WHERE id=$1",
      [id],
    ),
  );
  network.mockClear();
  await runBusinessToolsWorker();
  expect(network).not.toHaveBeenCalled();
});
it("does not call an API whose production approval flag is disabled", async () => {
  const id = await connect("automatic");
  vi.stubEnv("INSTAGRAM_ENABLED", "false");
  expect(await refresh(id)).toEqual({ synced: 0, failed: 0 });
  expect(network).not.toHaveBeenCalled();
  expect(await visible()).toEqual([]);
});
it("enforces Owner global and individual pauses without hiding a professional's already published work", async () => {
  const id = await connect("automatic");
  await refresh(id);
  await owner(false);
  network.mockClear();
  expect(await refresh(id)).toEqual({ synced: 0, failed: 0 });
  expect(network).not.toHaveBeenCalled();
  expect(await visible()).toHaveLength(2);
  await owner(true);
  await owner(false, pro);
  expect(await refresh(id)).toEqual({ synced: 0, failed: 0 });
  await owner(true, pro);
  expect((await refresh(id)).synced).toBe(1);
});
it("cannot publish an in-flight response after the Owner pauses the account", async () => {
  const id = await connect("automatic");
  network.mockImplementationOnce(async () => {
    await owner(false, pro);
    return Response.json({
      data: [
        {
          permalink: "https://www.instagram.com/p/AAA123/",
          timestamp: "2026-10-26T12:00Z",
        },
      ],
    });
  });
  expect(await refresh(id)).toEqual({ synced: 0, failed: 0 });
  expect(await visible()).toEqual([]);
});
it("honours switching from Automatic to Approval while a provider response is in flight", async () => {
  const id = await connect("automatic");
  network.mockImplementationOnce(async () => {
    await as("social-pro", (sql) =>
      sql.query(
        "UPDATE beauty.business_connections SET social_mode='approval' WHERE id=$1",
        [id],
      ),
    );
    return Response.json({
      data: [
        {
          permalink: "https://www.instagram.com/p/AAA123/",
          timestamp: "2026-10-26T12:00Z",
        },
      ],
    });
  });
  expect((await refresh(id)).synced).toBe(1);
  expect(await visible()).toEqual([]);
});
it("pins featured work and enforces the professional's public post limit", async () => {
  const id = await connect("automatic");
  await refresh(id);
  await as("social-pro", async (sql) => {
    await sql.query(
      "UPDATE beauty.social_portfolio SET featured=true WHERE external_id='BBB123'",
    );
    await sql.query(
      "INSERT INTO beauty.social_portfolio_preferences VALUES($1,1)",
      [pro],
    );
  });
  const posts = await visible();
  expect(posts).toHaveLength(1);
  expect(posts[0].original_url).toContain("BBB123");
  expect(posts[0].featured).toBe(true);
});
it("saves valid manual profile links without OAuth and rejects deceptive or post URLs", async () => {
  const body = {
    action: "portfolioPreferences",
    maxVisiblePosts: 8,
    instagramUrl: "https://instagram.com/fixture_studio/?ref=profile",
    tiktokUrl: "https://www.tiktok.com/@fixture.studio",
  };
  expect((await updateSocial(request(body))).status).toBe(200);
  const row = (
    await db.query<{ instagram_url: string }>(
      "SELECT instagram_url FROM beauty.professional_profiles WHERE id=$1",
      [pro],
    )
  ).rows[0];
  expect(row.instagram_url).toBe("https://www.instagram.com/fixture_studio/");
  expect(
    (
      await updateSocial(
        request({
          ...body,
          instagramUrl: "https://instagram.com.evil.test/fixture_studio",
        }),
      )
    ).status,
  ).toBe(400);
  expect(() =>
    socialProfileLink("https://instagram.com/p/AAA123/", "instagram"),
  ).toThrow();
});
it("protects post controls and Owner settings from other professionals and regular administrators", async () => {
  const id = await connect("automatic");
  await refresh(id);
  const post = (await visible())[0];
  io.identity.mockResolvedValue(actor("social-other-pro"));
  expect(
    (
      await updateSocial(
        request({
          id: post.id,
          publicationStatus: "hidden",
          serviceId: null,
          sortOrder: 0,
          featured: false,
        }),
      )
    ).status,
  ).toBe(403);
  for (const caller of ["social-pro", "social-customer", "social-admin"]) {
    io.identity.mockResolvedValue(actor(caller));
    expect((await ownerOverview()).status).toBe(403);
  }
  expect(
    (
      await as("social-other-pro", (sql) =>
        sql.query(
          "SELECT id FROM beauty.social_portfolio WHERE professional_id=$1",
          [pro],
        ),
      )
    ).rows,
  ).toEqual([]);
  await expect(
    as("social-pro", (sql) =>
      sql.query("UPDATE beauty.social_sync_settings SET enabled=false"),
    ),
  ).rejects.toThrow(/permission denied/);
  expect(otherPro).toBeTruthy();
});
it("requires a verified Owner session, returns token-free counts and records an audit reason", async () => {
  await connect();
  io.identity.mockResolvedValue(actor("social-owner", null));
  expect((await ownerOverview()).status).toBe(403);
  io.identity.mockResolvedValue(actor("social-owner"));
  const response = await ownerSettings(
    new Request("https://www.glohaus.shop/api/v1/admin/social-sync", {
      method: "POST",
      headers: {
        Origin: "https://www.glohaus.shop",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        professionalId: pro,
        enabled: false,
        reason: "Fixture owner pause",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const data = await (await ownerOverview()).json();
  expect(
    data.professionals.find((p: { id: string }) => p.id === pro).paused,
  ).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(
    /cipher|fixture-access|fixture-secret/,
  );
  expect(
    (
      await db.query(
        "SELECT id FROM beauty.admin_audit_logs WHERE action='social.sync.settings' AND reason='Fixture owner pause'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("hides revoked content, notifies once and stops automatic retrying until reconnection", async () => {
  const id = await connect("automatic");
  await refresh(id);
  network.mockResolvedValue(
    Response.json({ error: "expired" }, { status: 401 }),
  );
  expect((await refresh(id)).failed).toBe(1);
  expect(await visible()).toEqual([]);
  await refresh(id);
  expect(
    (
      await db.query(
        "SELECT id FROM beauty.in_app_notifications WHERE event_key LIKE $1",
        [`social-reconnect:${id}:%`],
      )
    ).rows,
  ).toHaveLength(1);
  network.mockClear();
  await as("social-pro", (sql) =>
    sql.query(
      "UPDATE beauty.business_connections SET next_sync_at=now() WHERE id=$1",
      [id],
    ),
  );
  await runBusinessToolsWorker();
  expect(network).not.toHaveBeenCalled();
});
it("preserves the published snapshot and permits bookings when a social API fails", async () => {
  const id = await connect("automatic");
  await refresh(id);
  network.mockResolvedValue(
    Response.json({ error: "temporarily unavailable" }, { status: 503 }),
  );
  expect((await refresh(id)).failed).toBe(1);
  expect(await visible()).toHaveLength(2);
  const date = new Date(Date.now() + 9 * 86400000);
  date.setUTCHours(12, 0, 0, 0);
  const result = await as("social-customer", (sql) =>
    sql.query(
      "SELECT beauty.reserve_booking($1,$2,beauty.public_service_policy($1)->>'token',true) AS data",
      [service, date.toISOString()],
    ),
  );
  expect(result.rows).toHaveLength(1);
});
it("sanitises a thumbnail behind public visibility checks and never exposes a hidden image", async () => {
  const id = await connect("automatic");
  await refresh(id);
  const post = (await visible())[0];
  io.thumbnail.mockResolvedValue(
    await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#be879b" },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: "Private fixture metadata" } })
      .toBuffer(),
  );
  const response = await readThumbnail(
    new Request(`https://www.glohaus.shop/api/v1/social-thumbnails/${post.id}`),
    { params: Promise.resolve({ id: post.id }) },
  );
  expect(response.status).toBe(200);
  const image = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  expect(image.format).toBe("webp");
  expect(image.exif).toBeUndefined();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  io.thumbnail.mockClear();
  await as("social-pro", (sql) =>
    sql.query(
      "UPDATE beauty.social_portfolio SET publication_status='hidden' WHERE id=$1",
      [post.id],
    ),
  );
  expect(
    (
      await readThumbnail(
        new Request(
          `https://www.glohaus.shop/api/v1/social-thumbnails/${post.id}`,
        ),
        { params: Promise.resolve({ id: post.id }) },
      )
    ).status,
  ).toBe(404);
  expect(io.thumbnail).not.toHaveBeenCalled();
});
it("rejects unapproved thumbnail hosts, credentials and redirects before exposing provider media", () => {
  for (const url of [
    "http://cdninstagram.com/image.jpg",
    "https://cdninstagram.com.evil.test/image.jpg",
    "https://user:pass@cdninstagram.com/image.jpg",
    "https://scontent.cdninstagram.com/image.jpg?access_token=secret",
    "https://127.0.0.1/image.jpg",
  ])
    expect(socialThumbnailUrl(url, "instagram")).toBe("");
  expect(
    socialThumbnailUrl(
      "https://p16-sign.tiktokcdn-us.com/image.jpg?x-expires=123&x-signature=public-media-signature",
      "tiktok",
    ),
  ).toContain("tiktokcdn-us.com");
});

it("imports TikTok video covers through the authorised Display API and deduplicates repeated results", async () => {
  const id = await connect("automatic", "tiktok");
  network.mockImplementation(async () =>
    Response.json({
      error: { code: "ok" },
      data: {
        videos: [
          {
            id: "12345678",
            share_url: "https://www.tiktok.com/@fictional/video/12345678",
            video_description: "Fictional TikTok work",
            create_time: 1793016000,
            cover_image_url:
              "https://p16-sign.tiktokcdn-us.com/cover.jpeg?signature=fixture",
          },
        ],
        has_more: false,
      },
    }),
  );
  expect(await refresh(id)).toEqual({ synced: 1, failed: 0 });
  expect(await refresh(id)).toEqual({ synced: 1, failed: 0 });
  const posts = await visible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    platform: "tiktok",
    media_type: "video",
    has_thumbnail: true,
  });
  expect((network.mock.calls[0] as unknown as [string])[0]).toContain(
    "cover_image_url",
  );
  expect(JSON.stringify(posts)).not.toContain("signature=fixture");
});
