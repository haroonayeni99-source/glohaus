import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  saveService,
  publicProfessionals,
  publicProfile,
} from "@/modules/professionals/repository";
import { publicPostPage, savePost } from "@/modules/posts/repository";
import {
  serviceQuote,
  taxonomyCatalog,
  mySelection,
} from "@/modules/taxonomy/repository";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
import type { TaxonomyCatalog } from "@/modules/taxonomy/domain";
const db = await createTestDatabase();
let pro: string, admin: string;
let braids: string, retwist: string, variation: string, extra: string;
let catalog: TaxonomyCatalog;
let hair: string,
  braiding: string,
  locs: string,
  knotless: string,
  retwistTemplate: string;
async function as<T>(
  tx: SqlClient,
  auth: string,
  work: () => Promise<T>,
  role = "beauty_app",
  verified = true,
) {
  await tx.query("SAVEPOINT actor");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query(
    "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
    [auth, String(verified)],
  );
  try {
    const r = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT actor");
    return r;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT actor");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT actor");
    throw e;
  }
}
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await work(tx);
      throw Error("ROLLBACK_TEST");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ROLLBACK_TEST")) throw e;
  }
}
const start = (offset = 0) => {
  const d = new Date(Date.now() + (4 + offset) * 86400000);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
};
async function selection(tx: SqlClient, ids = [braiding, locs]) {
  return as(tx, "multi-pro", () =>
    tx.query("SELECT beauty.save_my_specialities($1,$2,$3)", [
      [hair],
      ids,
      ids[0],
    ]),
  );
}
async function reserve(
  tx: SqlClient,
  service = retwist,
  when = start(),
  option: string | null = null,
  extras: string[] = [],
) {
  const policy = await as(
    tx,
    "",
    async () =>
      (
        await tx.query<{ data: { token: string } }>(
          "SELECT beauty.public_service_policy($1,$2,$3) AS data",
          [service, option, extras],
        )
      ).rows[0].data,
  );
  return as(
    tx,
    "multi-customer",
    async () =>
      (
        await tx.query<{
          data: { id: string; pricePence: number; depositPence: number };
        }>("SELECT beauty.reserve_booking($1,$2,$3,true,$4,$5) AS data", [
          service,
          when,
          policy.token,
          option,
          extras,
        ])
      ).rows[0].data,
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  catalog = await taxonomyCatalog(db);
  hair = catalog.categories.find((c) => c.slug === "hair")!.id;
  braiding = catalog.specialities.find((s) => s.slug === "braiding")!.id;
  locs = catalog.specialities.find((s) => s.slug === "locs")!.id;
  knotless = catalog.templates.find((t) => t.slug === "knotless-braids")!.id;
  retwistTemplate = catalog.templates.find((t) => t.slug === "retwist")!.id;
  for (const name of [
    "multi-pro",
    "multi-other",
    "multi-customer",
    "multi-admin",
  ]) {
    const a = await db.transaction((tx) =>
      as(tx, name, () =>
        enrolAccount(
          tx,
          {
            authId: name,
            email: `${name}@example.test`,
            displayName: name,
            secondFactorAge: null,
          },
          name === "multi-pro" || name === "multi-other"
            ? "professional"
            : "customer",
        ),
      ),
    );
    if (name === "multi-pro") pro = a.professionalId!;
    if (name === "multi-admin") {
      admin = a.id;
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [admin],
      );
    }
  }
  await db.query(
    "UPDATE beauty.professional_profiles SET slug='multi-studio',business_name='Multi Studio',bio='Braiding and loc maintenance in London',category='Hair',city='London',publication_status='published' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id,charges_enabled) VALUES($1,'acct_multi',true)",
    [pro],
  );
  for (let day = 0; day < 7; day++)
    await db.query(
      "INSERT INTO beauty.availability_rules(professional_id,weekday,start_minute,end_minute) VALUES($1,$2,0,1440)",
      [pro, day],
    );
  await db.transaction(async (tx) => {
    await selection(tx);
    braids = (
      await as(tx, "multi-pro", () =>
        saveService(tx, pro, {
          name: "Knotless Braids",
          description: "Braids prepared to your chosen size",
          durationMinutes: 90,
          pricePence: 12000,
          depositPence: 3600,
          active: true,
          categoryId: hair,
          specialityId: braiding,
          templateId: knotless,
          publicationStatus: "published",
        }),
      )
    ).id;
    retwist = (
      await as(tx, "multi-pro", () =>
        saveService(tx, pro, {
          name: "Retwist",
          description: "Loc maintenance",
          durationMinutes: 60,
          pricePence: 6000,
          depositPence: 1800,
          active: true,
          categoryId: hair,
          specialityId: locs,
          templateId: retwistTemplate,
          publicationStatus: "published",
          variations: [
            {
              name: "Long locs",
              pricePence: 9000,
              durationMinutes: 90,
              active: true,
              sortOrder: 0,
              attributes: { length: "Long" },
            },
          ],
          extras: [
            {
              name: "Loc styling",
              pricePence: 1000,
              durationMinutes: 15,
              active: true,
              sortOrder: 1,
              attributes: {},
            },
          ],
        }),
      )
    ).id;
  });
  const options = (
    await db.query<{ id: string; kind: string }>(
      "SELECT id,kind FROM beauty.service_options WHERE service_id=$1",
      [retwist],
    )
  ).rows;
  variation = options.find((o) => o.kind === "variation")!.id;
  extra = options.find((o) => o.kind === "extra")!.id;
});
afterAll(() => db.close());
describe("multi-speciality booking and discovery acceptance", () => {
  it("keeps Braiding and Locs on one professional and one public profile", () =>
    isolated(async (tx) => {
      const selected = await as(tx, "multi-pro", () => mySelection(tx));
      expect(selected.specialityIds.sort()).toEqual([braiding, locs].sort());
      expect(selected.primarySpecialityId).toBe(braiding);
      const profile = await as(tx, "", () => publicProfile(tx, "multi-studio"));
      expect(profile?.specialities.map((s) => s.name).sort()).toEqual([
        "Braiding",
        "Locs",
      ]);
      expect(
        profile?.services.map((s) => [s.name, s.speciality_name]).sort(),
      ).toEqual([
        ["Knotless Braids", "Braiding"],
        ["Retwist", "Locs"],
      ]);
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.professional_payment_accounts WHERE professional_id=$1",
            [pro],
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it.each([
    "Retwist",
    "retwists",
    "retwst",
    "loc retwist",
    "Knotless Braids",
    "knotless",
    "cornrows",
    "facial",
  ])("matches precise treatment %s without unrelated services", (term) =>
    isolated(async (tx) => {
      const rows = await as(tx, "", () => publicProfessionals(tx, term));
      if (["cornrows", "facial"].includes(term)) {
        expect(rows).toHaveLength(0);
        return;
      }
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(pro);
      expect(rows[0].matching_services?.map((s) => s.name)).toEqual([
        term.toLowerCase().includes("knotless") ? "Knotless Braids" : "Retwist",
      ]);
    }),
  );
  it("returns one general Hair result even when two specialities match", () =>
    isolated(async (tx) => {
      const rows = await as(tx, "", () => publicProfessionals(tx, "Hair"));
      expect(rows.map((r) => r.id)).toEqual([pro]);
      expect(rows[0].matching_services).toHaveLength(2);
    }));
  it("requires offered services rather than speciality selection alone", () =>
    isolated(async (tx) => {
      await tx.query("UPDATE beauty.services SET active=false WHERE id=$1", [
        retwist,
      ]);
      expect(
        await as(tx, "", () => publicProfessionals(tx, "Locs")),
      ).toHaveLength(0);
      expect(
        await as(tx, "", () => publicProfessionals(tx, "Knotless Braids")),
      ).toHaveLength(1);
    }));
  it("applies taxonomy and price filters to the actual matching service", () =>
    isolated(async (tx) => {
      expect(
        await as(tx, "", () =>
          publicProfessionals(tx, "", undefined, {
            ...defaultDiscoveryFilters,
            specialityId: locs,
            maxPricePence: 7000,
          }),
        ),
      ).toHaveLength(1);
      expect(
        await as(tx, "", () =>
          publicProfessionals(tx, "", undefined, {
            ...defaultDiscoveryFilters,
            specialityId: braiding,
            maxPricePence: 7000,
          }),
        ),
      ).toHaveLength(0);
    }));
  it("does not expose drafts or inactive services", () =>
    isolated(async (tx) => {
      await tx.query(
        "UPDATE beauty.services SET publication_status='draft' WHERE id=$1",
        [retwist],
      );
      expect(
        await as(tx, "", () => publicProfessionals(tx, "Retwist")),
      ).toHaveLength(0);
      await expect(reserve(tx)).rejects.toThrow("UNAVAILABLE_SERVICE");
    }));
  it("calculates variation and extras prices and duration on the server", () =>
    isolated(async (tx) => {
      const quote = await as(tx, "", () =>
        serviceQuote(tx, retwist, variation, [extra]),
      );
      expect(quote).toMatchObject({
        pricePence: 10000,
        depositPence: 3000,
        durationMinutes: 105,
        professionalId: pro,
        variationName: "Long locs",
        extraNames: ["Loc styling"],
      });
      const booking = await reserve(tx, retwist, start(), variation, [extra]);
      expect(booking.pricePence).toBe(10000);
      expect(booking.depositPence).toBe(3000);
      const snapshot = (
        await tx.query<{
          duration_minutes: number;
          taxonomy_snapshot: { specialityId: string };
          service_options_snapshot: { variationId: string; extraIds: string[] };
        }>(
          "SELECT duration_minutes,taxonomy_snapshot,service_options_snapshot FROM beauty.bookings WHERE id=$1",
          [booking.id],
        )
      ).rows[0];
      expect(snapshot.duration_minutes).toBe(105);
      expect(snapshot.taxonomy_snapshot.specialityId).toBe(locs);
      expect(snapshot.service_options_snapshot.variationId).toBe(variation);
    }));
  it("rejects forged, duplicate or inactive options", () =>
    isolated(async (tx) => {
      await expect(
        as(tx, "", () => serviceQuote(tx, braids, variation)),
      ).rejects.toThrow("INVALID_OPTIONS");
      await expect(
        as(tx, "", () => serviceQuote(tx, retwist, null, [extra, extra])),
      ).rejects.toThrow("INVALID_OPTIONS");
      await tx.query(
        "UPDATE beauty.service_options SET active=false WHERE id=$1",
        [extra],
      );
      await expect(
        as(tx, "", () => serviceQuote(tx, retwist, null, [extra])),
      ).rejects.toThrow("INVALID_OPTIONS");
    }));
  it("invalidates accepted terms when a selected option changes", () =>
    isolated(async (tx) => {
      const p = (
        await tx.query<{ data: { token: string } }>(
          "SELECT beauty.public_service_policy($1,$2,$3) AS data",
          [retwist, variation, [extra]],
        )
      ).rows[0].data;
      await tx.query(
        "UPDATE beauty.service_options SET price_pence=1100 WHERE id=$1",
        [extra],
      );
      await expect(
        as(tx, "multi-customer", () =>
          tx.query("SELECT beauty.reserve_booking($1,$2,$3,true,$4,$5)", [
            retwist,
            start(),
            p.token,
            variation,
            [extra],
          ]),
        ),
      ).rejects.toThrow("POLICY_CHANGED");
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.bookings WHERE professional_id=$1",
            [pro],
          )
        ).rows,
      ).toHaveLength(0);
    }));
  it("prevents overlapping bookings between Braiding and Locs using the shared calendar", () =>
    isolated(async (tx) => {
      await reserve(tx, retwist, start(), variation, [extra]);
      await expect(reserve(tx, braids, start())).rejects.toThrow(
        /SLOT_TAKEN|exclusion/,
      );
      const second = await reserve(tx, braids, start(1));
      const ids = (
        await tx.query<{ professional_id: string }>(
          "SELECT professional_id FROM beauty.bookings WHERE professional_id=$1",
          [pro],
        )
      ).rows;
      expect(ids).toHaveLength(2);
      expect(ids.every((b) => b.professional_id === pro)).toBe(true);
      expect(second.id).toBeTruthy();
    }));
  it("preserves booking snapshots when a speciality is removed and prevents new reservations", () =>
    isolated(async (tx) => {
      const booking = await reserve(tx);
      const before = (
        await tx.query("SELECT * FROM beauty.bookings WHERE id=$1", [
          booking.id,
        ])
      ).rows[0];
      await selection(tx, [braiding]);
      expect(
        (
          await tx.query("SELECT * FROM beauty.bookings WHERE id=$1", [
            booking.id,
          ])
        ).rows[0],
      ).toEqual(before);
      expect(
        await as(tx, "", () => publicProfessionals(tx, "Retwist")),
      ).toHaveLength(0);
      await expect(reserve(tx, retwist, start(1))).rejects.toThrow(
        "UNAVAILABLE_SERVICE",
      );
      await expect(
        tx.query(
          "UPDATE beauty.bookings SET taxonomy_snapshot='{}' WHERE id=$1",
          [booking.id],
        ),
      ).rejects.toThrow("IMMUTABLE_BOOKING_SNAPSHOT");
    }));
  it("enforces selected speciality ownership and category relationships", () =>
    isolated(async (tx) => {
      await expect(
        as(tx, "multi-other", () =>
          tx.query("UPDATE beauty.services SET speciality_id=$2 WHERE id=$1", [
            retwist,
            braiding,
          ]),
        ),
      ).resolves.toMatchObject({ rows: [] });
      const nails = catalog.categories.find((c) => c.slug === "nails")!.id;
      await expect(
        as(tx, "multi-pro", () =>
          saveService(tx, pro, {
            name: "Forged",
            description: "",
            durationMinutes: 60,
            pricePence: 5000,
            depositPence: 1500,
            active: true,
            categoryId: nails,
            specialityId: locs,
          }),
        ),
      ).rejects.toThrow("INVALID_TAXONOMY");
      await expect(
        as(tx, "multi-other", () =>
          tx.query("SELECT beauty.save_my_service_options($1,'[]','[]')", [
            retwist,
          ]),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }));
  it("filters Discover video and portfolio associations by speciality without copying media", () =>
    isolated(async (tx) => {
      const asset = (
        await tx.query<{ id: string }>(
          "INSERT INTO beauty.portfolio_assets(professional_id,blob_path,mime_type,alt_text,publication_status,media_type) VALUES($1,'multi/video.mp4','video/mp4','Loc maintenance video','published','video') RETURNING id",
          [pro],
        )
      ).rows[0].id;
      await as(tx, "multi-pro", async () => {
        await tx.query("SELECT beauty.save_my_portfolio_specialities($1,$2)", [
          asset,
          [locs],
        ]);
        await savePost(tx, pro, {
          title: "Loc maintenance",
          body: "A demonstration of our loc maintenance appointment.",
          kind: "tutorial",
          publicationStatus: "published",
          serviceId: retwist,
          assetId: asset,
        });
        await savePost(tx, pro, {
          title: "Braiding process",
          body: "A demonstration of our knotless braiding appointment.",
          kind: "tutorial",
          publicationStatus: "published",
          serviceId: braids,
          assetId: asset,
        });
      });
      const feed = await as(tx, "", () =>
        publicPostPage(tx, undefined, { specialityId: locs }),
      );
      expect(feed.posts.map((p) => p.title)).toEqual(["Loc maintenance"]);
      expect(feed.posts[0]).toMatchObject({
        service_id: retwist,
        asset_id: asset,
        asset_media_type: "video",
      });
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT * FROM beauty.public_portfolio_specialities WHERE speciality_id=$1",
              [locs],
            ),
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await tx.query("SELECT * FROM beauty.portfolio_assets WHERE id=$1", [
            asset,
          ])
        ).rows,
      ).toHaveLength(1);
    }));
  it("requires verified Admin access for catalogue edits and records an audit entry", () =>
    isolated(async (tx) => {
      const input = {
        operation: "speciality",
        id: null,
        categoryId: hair,
        name: "Hair Treatments",
        slug: "hair-treatments",
        description: "Treatment choices",
        active: true,
        sortOrder: 200,
        aliases: ["hair treatment"],
        reason: "Add a reviewed speciality",
      };
      await expect(
        as(tx, "multi-pro", () =>
          tx.query("SELECT beauty.admin_update_taxonomy($1)", [
            JSON.stringify(input),
          ]),
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        as(
          tx,
          "multi-admin",
          () =>
            tx.query("SELECT beauty.admin_update_taxonomy($1)", [
              JSON.stringify(input),
            ]),
          "beauty_app",
          false,
        ),
      ).rejects.toThrow("FORBIDDEN");
      await as(tx, "multi-admin", () =>
        tx.query("SELECT beauty.admin_update_taxonomy($1)", [
          JSON.stringify(input),
        ]),
      );
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.admin_audit_logs WHERE action='taxonomy.speciality'",
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it("merges specialities while retaining historical booking labels and IDs", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      await as(tx, "multi-admin", () =>
        tx.query("SELECT beauty.admin_update_taxonomy($1)", [
          JSON.stringify({
            operation: "merge",
            sourceId: locs,
            targetId: braiding,
            reason: "Merge reviewed taxonomy definitions",
          }),
        ]),
      );
      const booking = (
        await tx.query<{
          service_id: string;
          taxonomy_snapshot: { specialityId: string };
        }>(
          "SELECT service_id,taxonomy_snapshot FROM beauty.bookings WHERE id=$1",
          [b.id],
        )
      ).rows[0];
      expect(booking).toMatchObject({
        service_id: retwist,
        taxonomy_snapshot: { specialityId: locs },
      });
      expect(
        (
          await tx.query<{ speciality_id: string }>(
            "SELECT speciality_id FROM beauty.services WHERE id=$1",
            [retwist],
          )
        ).rows[0].speciality_id,
      ).toBe(braiding);
      expect(
        (await as(tx, "multi-pro", () => mySelection(tx))).specialityIds,
      ).toEqual([braiding]);
    }));
  it("moves a speciality between categories without altering booked prices", () =>
    isolated(async (tx) => {
      const b = await reserve(tx);
      const c = catalog.categories.find((c) => c.slug === "nails")!;
      const s = catalog.specialities.find((s) => s.id === locs)!;
      await as(tx, "multi-admin", () =>
        tx.query("SELECT beauty.admin_update_taxonomy($1)", [
          JSON.stringify({
            operation: "speciality",
            id: locs,
            categoryId: c.id,
            name: s.name,
            slug: s.slug,
            description: "Moved definition",
            active: true,
            sortOrder: 100,
            aliases: [],
            reason: "Move reviewed speciality",
          }),
        ]),
      );
      expect(
        (
          await tx.query<{ category_id: string }>(
            "SELECT category_id FROM beauty.services WHERE id=$1",
            [retwist],
          )
        ).rows[0].category_id,
      ).toBe(c.id);
      expect(
        (
          await tx.query<{ price_pence: number }>(
            "SELECT price_pence FROM beauty.bookings WHERE id=$1",
            [b.id],
          )
        ).rows[0].price_pence,
      ).toBe(6000);
    }));
  it("retains full prepayment and the shared unverified monthly limit", () =>
    isolated(async (tx) => {
      await tx.query(
        "UPDATE beauty.professional_trust_status SET verification_status='unverified' WHERE professional_id=$1",
        [pro],
      );
      await tx.query(
        "UPDATE beauty.services SET deposit_pence=0 WHERE professional_id=$1",
        [pro],
      );
      for (let i = 0; i < 5; i++) {
        const b = await reserve(tx, i % 2 ? braids : retwist, start(i));
        expect(b.depositPence).toBe(b.pricePence);
      }
      await expect(reserve(tx, braids, start(6))).rejects.toThrow(
        "VERIFICATION_REQUIRED",
      );
    }));
  it("uses the same wallet ledger for payments from both specialities", () =>
    isolated(async (tx) => {
      const bookings = [
        await reserve(tx, retwist, start()),
        await reserve(tx, braids, start(1)),
      ];
      let proceeds = 0;
      for (const b of bookings) {
        const quote = await as(
          tx,
          "multi-customer",
          async () =>
            (
              await tx.query<{
                q: {
                  customerTotalPence: number;
                  professionalProceedsPence: number;
                };
              }>("SELECT beauty.prepare_booking_financial_quote($1) AS q", [
                b.id,
              ])
            ).rows[0].q,
        );
        proceeds += quote.professionalProceedsPence;
        await as(tx, "multi-customer", () =>
          tx.query("SELECT beauty.attach_checkout($1,$2)", [
            b.id,
            "cs_" + b.id,
          ]),
        );
        await as(
          tx,
          "",
          async () => {
            await tx.query(
              "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,'gbp')",
              [
                "evt_" + b.id,
                b.id,
                "cs_" + b.id,
                "pi_" + b.id,
                quote.customerTotalPence,
              ],
            );
            await tx.query(
              "SELECT beauty.record_booking_payment_finance($1,$2)",
              [b.id, "pi_" + b.id],
            );
          },
          "beauty_payment_worker",
        );
      }
      const wallet = await as(
        tx,
        "multi-pro",
        async () =>
          (
            await tx.query<{ data: { pendingPence: number } }>(
              "SELECT beauty.my_wallet_overview() AS data",
            )
          ).rows[0].data,
      );
      expect(wallet.pendingPence).toBe(proceeds);
      const accounts = (
        await tx.query<{ professional_id: string }>(
          "SELECT DISTINCT professional_id FROM beauty.financial_ledger_accounts WHERE professional_id=$1",
          [pro],
        )
      ).rows;
      expect(accounts).toEqual([{ professional_id: pro }]);
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.professional_payment_accounts WHERE professional_id=$1",
            [pro],
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it("publishes services across unrelated categories without another account", () =>
    isolated(async (tx) => {
      const nail = catalog.specialities.find((s) => s.slug === "gel-nails")!;
      const gel = catalog.templates.find((t) => t.slug === "gel-polish")!;
      await as(tx, "multi-pro", () =>
        tx.query("SELECT beauty.save_my_specialities($1,$2,$3)", [
          [hair, nail.category_id],
          [braiding, locs, nail.id],
          braiding,
        ]),
      );
      await as(tx, "multi-pro", () =>
        saveService(tx, pro, {
          name: "Gel Polish",
          description: "A polished nail service",
          durationMinutes: 45,
          pricePence: 4000,
          depositPence: 1200,
          active: true,
          categoryId: nail.category_id,
          specialityId: nail.id,
          templateId: gel.id,
        }),
      );
      for (const query of ["Retwist", "Knotless Braids", "Gel manicure"]) {
        const matches = await as(tx, "", () => publicProfessionals(tx, query));
        expect(matches.map((p) => p.id)).toEqual([pro]);
      }
      expect(
        (
          await tx.query(
            "SELECT * FROM beauty.professional_profiles WHERE id=$1",
            [pro],
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it("filters only verified completed-booking reviews by service and speciality", () =>
    isolated(async (tx) => {
      const customer = (
        await tx.query<{ id: string }>(
          "SELECT id FROM beauty.users WHERE auth_id='multi-customer'",
        )
      ).rows[0].id;
      const b = (
        await tx.query<{ id: string }>(
          `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at,taxonomy_snapshot) VALUES($1,$2,$3,'Retwist','Test Client','Multi Studio',now()-interval '2 days',now()-interval '2 days'+interval '1 hour',60,6000,1800,'completed',now()-interval '2 days',$4::jsonb) RETURNING id`,
          [
            pro,
            customer,
            retwist,
            JSON.stringify({ specialityId: locs, specialityName: "Locs" }),
          ],
        )
      ).rows[0].id;
      await as(tx, "multi-customer", () =>
        tx.query(
          "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,5,'A lovely completed appointment','Test Client')",
          [b],
        ),
      );
      const reviews = await as(tx, "", () =>
        tx.query(
          "SELECT service_id,speciality_id FROM beauty.public_reviews WHERE service_id=$1 AND speciality_id=$2",
          [retwist, locs],
        ),
      );
      expect(reviews.rows).toEqual([
        { service_id: retwist, speciality_id: locs },
      ]);
      await tx.query(
        "UPDATE beauty.reviews SET moderation_status='hidden' WHERE booking_id=$1",
        [b],
      );
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT * FROM beauty.public_reviews WHERE service_id=$1",
              [retwist],
            ),
          )
        ).rows,
      ).toHaveLength(0);
    }));
  it("rechecks service availability against time off in the common professional calendar", () =>
    isolated(async (tx) => {
      const day = start().slice(0, 10);
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT beauty.public_service_available_on($1,$2) AS available",
              [retwist, day],
            ),
          )
        ).rows[0].available,
      ).toBe(true);
      await tx.query(
        "INSERT INTO beauty.availability_blocks(professional_id,starts_at,ends_at) VALUES($1,$2::date-interval '1 day',$2::date+interval '2 days')",
        [pro, day],
      );
      expect(
        (
          await as(tx, "", () =>
            tx.query(
              "SELECT beauty.public_service_available_on($1,$2) AS available",
              [retwist, day],
            ),
          )
        ).rows[0].available,
      ).toBe(false);
      await expect(reserve(tx)).rejects.toThrow(/SLOT_TAKEN|OUTSIDE_HOURS/);
    }));
  it("protects new tables with forced RLS and denies anonymous mutation entry points", () =>
    isolated(async (tx) => {
      const flags = (
        await tx.query<{
          relname: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='beauty'::regnamespace AND relname=ANY($1)",
          [
            [
              "specialities",
              "professional_specialities",
              "service_templates",
              "service_options",
              "portfolio_specialities",
              "taxonomy_demand_daily",
            ],
          ],
        )
      ).rows;
      expect(flags).toHaveLength(6);
      expect(
        flags.every((f) => f.relrowsecurity && f.relforcerowsecurity),
      ).toBe(true);
      await expect(
        as(
          tx,
          "",
          () =>
            tx.query("SELECT beauty.save_my_specialities($1,$2,$3)", [
              [hair],
              [locs],
              locs,
            ]),
          "anon",
        ),
      ).rejects.toThrow(/permission denied/);
      expect(
        (
          await as(tx, "", () =>
            tx.query("SELECT * FROM beauty.professional_specialities"),
          )
        ).rows,
      ).toHaveLength(0);
    }));
});
