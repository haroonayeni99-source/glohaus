import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile, saveService } from "@/modules/professionals/repository";
import { saveSchedule } from "@/modules/availability/repository";
import { publicSocialPosts } from "@/modules/business-tools/repository";
const db = await createTestDatabase();
let pro: string, otherPro: string, service: string;
const start = new Date(Date.now() + 7 * 86400000);
start.setUTCHours(12, 0, 0, 0);
const date = start.toISOString(),
  later = new Date(start.getTime() + 3600000).toISOString();
async function as<T>(
  tx: SqlClient,
  id: string,
  work: () => Promise<T>,
  role = "beauty_app",
) {
  await tx.query("SAVEPOINT caller");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query("SELECT set_config('app.auth_id',$1,true)", [id]);
  try {
    const result = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT caller");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK TO SAVEPOINT caller");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT caller");
    throw error;
  }
}
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await work(tx);
      throw Error("ROLLBACK_FIXTURE");
    });
  } catch (error) {
    if (!(error instanceof Error && error.message === "ROLLBACK_FIXTURE"))
      throw error;
  }
}
async function connection(tx: SqlClient, status = "connected") {
  return as(
    tx,
    "tools-pro",
    async () =>
      (
        await tx.query<{ id: string }>(
          "INSERT INTO beauty.business_connections(professional_id,provider,label,secret_ciphertext,status,last_success_at) VALUES($1,'google','Fixture calendar','ciphertext',$2,now()) RETURNING id",
          [pro, status],
        )
      ).rows[0].id,
  );
}
async function reserve(tx: SqlClient, at = date) {
  return as(
    tx,
    "tools-alice",
    async () =>
      (
        await tx.query<{ data: { id: string } }>(
          "SELECT beauty.reserve_booking($1,$2,beauty.public_service_policy($1)->>'token',true) AS data",
          [service, at],
        )
      ).rows[0].data.id,
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const id of [
    "tools-pro",
    "tools-other-pro",
    "tools-alice",
    "tools-bob",
  ]) {
    await db.transaction(async (tx) =>
      as(tx, id, async () => {
        const proRole = id.includes("pro");
        const a = await enrolAccount(
          tx,
          {
            authId: id,
            email: `${id}@example.test`,
            displayName: id,
            secondFactorAge: null,
          },
          proRole ? "professional" : "customer",
        );
        if (id === "tools-pro") pro = a.professionalId!;
        if (id === "tools-other-pro") otherPro = a.professionalId!;
      }),
    );
  }
  await db.transaction(async (tx) =>
    as(tx, "tools-pro", async () => {
      await updateProfile(tx, pro, {
        slug: "tools-studio",
        businessName: "Tools Studio",
        bio: "Fictional professional for isolated business tool checks.",
        city: "London",
        category: "Nails",
        publicationStatus: "published",
      });
      service = (
        await saveService(tx, pro, {
          name: "Manicure",
          description: "",
          durationMinutes: 60,
          pricePence: 4500,
          depositPence: 1500,
          active: true,
        })
      ).id as string;
      await saveSchedule(
        tx,
        pro,
        Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startMinute: 480,
          endMinute: 1200,
        })),
      );
      await tx.query(
        "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_tools_fixture')",
        [pro],
      );
    }),
  );
  await db.transaction(async (tx) =>
    as(
      tx,
      "",
      async () => {
        await tx.query(
          "SELECT beauty.sync_connect_account('acct_tools_fixture',true)",
        );
        await tx.query(
          "SELECT beauty.sync_connect_verification('acct_tools_fixture',true)",
        );
      },
      "beauty_payment_worker",
    ),
  );
});
afterAll(() => db.close());
describe("business tools database boundaries", () => {
  it("denies other professionals and customers access to connection credentials", () =>
    isolated(async (tx) => {
      const id = await connection(tx);
      for (const caller of ["tools-other-pro", "tools-alice", ""])
        expect(
          (
            await as(tx, caller, () =>
              tx.query(
                "SELECT secret_ciphertext FROM beauty.business_connections WHERE id=$1",
                [id],
              ),
            )
          ).rows,
        ).toEqual([]);
      expect(
        (
          await as(tx, "tools-pro", () =>
            tx.query(
              "SELECT secret_ciphertext FROM beauty.business_connections WHERE id=$1",
              [id],
            ),
          )
        ).rows,
      ).toHaveLength(1);
    }));
  it("denies cross-owner settings and social service associations", () =>
    isolated(async (tx) => {
      await expect(
        as(tx, "tools-other-pro", () =>
          tx.query(
            "INSERT INTO beauty.calendar_preferences(professional_id) VALUES($1)",
            [pro],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        as(tx, "tools-other-pro", () =>
          tx.query(
            "INSERT INTO beauty.social_portfolio(professional_id,platform,external_id,original_url,service_id) VALUES($1,'instagram','abc123','https://www.instagram.com/p/abc123/',$2)",
            [otherPro, service],
          ),
        ),
      ).rejects.toThrow(/FORBIDDEN/);
    }));
  it("blocks a new reservation against an external appointment using the database guard", () =>
    isolated(async (tx) => {
      const id = await connection(tx);
      await as(tx, "tools-pro", () =>
        tx.query(
          "INSERT INTO beauty.external_calendar_busy(connection_id,professional_id,event_key,starts_at,ends_at) VALUES($1,$2,'external',$3,$4)",
          [id, pro, date, later],
        ),
      );
      await expect(reserve(tx)).rejects.toThrow("SLOT_TAKEN");
      const busy = await as(tx, "", () =>
        tx.query("SELECT * FROM beauty.booking_busy($1,$2,$3)", [
          pro,
          date,
          later,
        ]),
      );
      expect(busy.rows).toHaveLength(1);
      expect(Object.keys(busy.rows[0])).toEqual(["starts_at", "ends_at"]);
    }));
  it("allows a slot after a cancelled external appointment is removed", () =>
    isolated(async (tx) => {
      const id = await connection(tx);
      await as(tx, "tools-pro", () =>
        tx.query(
          "INSERT INTO beauty.external_calendar_busy(connection_id,professional_id,event_key,starts_at,ends_at) VALUES($1,$2,'external',$3,$4)",
          [id, pro, date, later],
        ),
      );
      await as(tx, "tools-pro", () =>
        tx.query(
          "DELETE FROM beauty.external_calendar_busy WHERE connection_id=$1",
          [id],
        ),
      );
      expect(await reserve(tx)).toMatch(/^[a-f0-9-]{36}$/);
    }));
  it("applies buffers to manual blocks and rejects last-second adjacent collisions", () =>
    isolated(async (tx) => {
      await as(tx, "tools-pro", () =>
        tx.query(
          "INSERT INTO beauty.calendar_preferences(professional_id,buffer_minutes) VALUES($1,15)",
          [pro],
        ),
      );
      await as(tx, "tools-pro", () =>
        tx.query(
          "INSERT INTO beauty.availability_blocks(professional_id,starts_at,ends_at,label) VALUES($1,$2,$3,'Private regular client')",
          [pro, later, new Date(start.getTime() + 2 * 3600000).toISOString()],
        ),
      );
      await expect(reserve(tx)).rejects.toThrow("SLOT_TAKEN");
      const busy = await as(tx, "", () =>
        tx.query<{ starts_at: Date }>(
          "SELECT * FROM beauty.booking_busy($1,$2,$3)",
          [pro, date, new Date(start.getTime() + 4 * 3600000).toISOString()],
        ),
      );
      expect(new Date(busy.rows[0].starts_at).toISOString()).toBe(
        new Date(start.getTime() + 45 * 60000).toISOString(),
      );
    }));
  it("does not assume stale or disconnected calendars are synchronised", () =>
    isolated(async (tx) => {
      const id = await connection(tx);
      await as(tx, "tools-pro", () =>
        tx.query(
          "UPDATE beauty.business_connections SET last_success_at=now()-interval '11 minutes' WHERE id=$1",
          [id],
        ),
      );
      await expect(reserve(tx)).rejects.toThrow("CALENDAR_UNAVAILABLE");
      await as(tx, "tools-pro", () =>
        tx.query(
          "UPDATE beauty.business_connections SET status='disconnected',secret_ciphertext='' WHERE id=$1",
          [id],
        ),
      );
      expect(await reserve(tx)).toBeTruthy();
    }));
  it("prevents duplicate live booking holds without changing fees", () =>
    isolated(async (tx) => {
      const first = await reserve(tx);
      expect(await reserve(tx)).toBe(first);
      await expect(
        as(tx, "tools-bob", () =>
          tx.query(
            "SELECT beauty.reserve_booking($1,$2,beauty.public_service_policy($1)->>'token',true)",
            [service, date],
          ),
        ),
      ).rejects.toThrow("SLOT_TAKEN");
      const row = await tx.query<{
        price_pence: number;
        deposit_pence: number;
      }>(
        "SELECT price_pence,deposit_pence FROM beauty.bookings WHERE professional_id=$1",
        [pro],
      );
      expect(row.rows[0]).toEqual({ price_pence: 4500, deposit_pence: 1500 });
    }));
  it("only publishes approved social posts from published professionals and current services", () =>
    isolated(async (tx) => {
      await as(tx, "tools-pro", () =>
        tx.query(
          "INSERT INTO beauty.social_portfolio(professional_id,platform,external_id,original_url,caption,service_id) VALUES($1,'instagram','abc123','https://www.instagram.com/p/abc123/','Fictional nails',$2)",
          [pro, service],
        ),
      );
      expect(await as(tx, "", () => publicSocialPosts(tx, pro))).toEqual([]);
      await as(tx, "tools-pro", () =>
        tx.query(
          "UPDATE beauty.social_portfolio SET publication_status='published' WHERE professional_id=$1",
          [pro],
        ),
      );
      const posts = await as(tx, "", () => publicSocialPosts(tx, pro));
      expect(posts[0].price_pence).toBe(4500);
      expect(posts[0].source_created_at).toBeNull();
      await as(tx, "tools-pro", () =>
        tx.query(
          "UPDATE beauty.social_portfolio SET publication_status='hidden' WHERE professional_id=$1",
          [pro],
        ),
      );
      expect(await as(tx, "", () => publicSocialPosts(tx, pro))).toEqual([]);
    }));
  it("keeps structured feedback and suggestions private while allowing rating-only verified reviews", () =>
    isolated(async (tx) => {
      const booking = await reserve(tx);
      await tx.query(
        "UPDATE beauty.bookings SET status='completed',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour',completed_at=now() WHERE id=$1",
        [booking],
      );
      const review = await as(
        tx,
        "tools-alice",
        async () =>
          (
            await tx.query<{ id: string }>(
              "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,1,'','Client') RETURNING id",
              [booking],
            )
          ).rows[0].id,
      );
      await as(tx, "tools-alice", () =>
        tx.query(
          "INSERT INTO beauty.review_feedback(review_id,answers,private_suggestion) VALUES($1,'{\"timing\":\"very_late\"}','Private improvement note')",
          [review],
        ),
      );
      for (const caller of ["tools-pro", "tools-alice"])
        expect(
          (
            await as(tx, caller, () =>
              tx.query(
                "SELECT * FROM beauty.review_feedback WHERE review_id=$1",
                [review],
              ),
            )
          ).rows,
        ).toHaveLength(1);
      for (const caller of ["tools-bob", "tools-other-pro", ""])
        expect(
          (
            await as(tx, caller, () =>
              tx.query(
                "SELECT * FROM beauty.review_feedback WHERE review_id=$1",
                [review],
              ),
            )
          ).rows,
        ).toEqual([]);
      const publicReview = await as(tx, "", () =>
        tx.query("SELECT * FROM beauty.public_reviews WHERE id=$1", [review]),
      );
      expect(publicReview.rows).toHaveLength(1);
      expect(JSON.stringify(publicReview)).not.toContain("Private improvement");
      await expect(
        as(tx, "tools-bob", () =>
          tx.query("INSERT INTO beauty.review_feedback(review_id) VALUES($1)", [
            review,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    }));
  it("limits health and sync routing functions to their authorised roles", () =>
    isolated(async (tx) => {
      await expect(
        as(tx, "tools-alice", () =>
          tx.query("SELECT beauty.admin_business_tools_health()"),
        ),
      ).rejects.toThrow(/FORBIDDEN|MFA/);
      await expect(
        as(tx, "tools-pro", () =>
          tx.query("SELECT * FROM beauty.due_business_connections()"),
        ),
      ).rejects.toThrow(/permission denied/);
      await connection(tx);
      expect(
        (
          await as(
            tx,
            "",
            () =>
              tx.query("SELECT * FROM beauty.service_calendar_owner($1)", [
                service,
              ]),
            "beauty_payment_worker",
          )
        ).rows[0],
      ).toMatchObject({ professional_id: pro, auth_id: "tools-pro" });
    }));
});
