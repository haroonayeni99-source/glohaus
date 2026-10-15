import { beforeAll, afterAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { authorize } from "@/modules/accounts/domain";
import {
  enrolAccount,
  ensureCustomerAccount,
  findAccount,
  type SqlClient,
} from "@/modules/accounts/repository";
const db = await createTestDatabase();
const users: Record<string, string> = {};
let pro: string,
  service: string,
  product: string,
  asset: string,
  photo: string,
  booking: string,
  live: string;
const identity = (authId: string) => ({
  authId,
  email: `${authId}@example.test`,
  displayName: authId,
  secondFactorAge: 0,
});
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
const visibility = (tx: SqlClient, hidden: boolean, user = users.pro) =>
  as(tx, "visibility-owner", () =>
    tx.query(
      "SELECT beauty.owner_set_account_visibility($1,$2,'Owner managing fixture account')",
      [user, hidden],
    ),
  );
const views = [
  ["public_professionals", "id", () => pro],
  ["public_profile_details", "id", () => pro],
  ["public_services", "professional_id", () => pro],
  ["public_products", "professional_id", () => pro],
  ["public_posts", "professional_id", () => pro],
  ["public_stories", "professional_id", () => pro],
  ["public_portfolio", "professional_id", () => pro],
  ["public_media_assets", "professional_id", () => pro],
  ["published_asset_paths", "id", () => asset],
  ["published_media_paths", "id", () => asset],
  ["published_profile_photo_paths", "id", () => photo],
  ["public_reviews", "professional_id", () => pro],
] as const;
async function publicCounts(tx: SqlClient) {
  const counts: Record<string, number> = {};
  for (const [view, field, id] of views)
    counts[view] = (
      await as(tx, "", () =>
        tx.query(`SELECT * FROM beauty.${view} WHERE ${field}=$1`, [id()]),
      )
    ).rows.length;
  return counts;
}
async function history(tx: SqlClient) {
  const rows: Record<string, unknown> = {};
  for (const table of [
    "bookings",
    "payments",
    "financial_ledger_entries",
    "professional_payment_accounts",
  ])
    rows[table] = (
      await tx.query(`SELECT * FROM beauty.${table} ORDER BY 1`)
    ).rows;
  return rows;
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const name of ["pro", "customer", "owner", "admin", "other-owner"]) {
    const account = await db.transaction((tx) =>
      as(tx, `visibility-${name}`, () =>
        enrolAccount(
          tx,
          identity(`visibility-${name}`),
          name === "pro" ? "professional" : "customer",
        ),
      ),
    );
    users[name] = account.id;
    if (name === "pro") pro = account.professionalId!;
  }
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($1,'admin'),($2,'admin')",
    [users.owner, users.admin],
  );
  await db.query(
    "UPDATE beauty.professional_profiles SET slug='visibility-studio',business_name='Visibility Studio',bio='Professional fixture for account visibility',category='Hair',city='London',publication_status='published' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id,charges_enabled) VALUES($1,'acct_visibility',true)",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.financial_fee_rules(transaction_kind,category_key,fee_payer,percentage_basis_points,fixed_fee_pence,minimum_fee_pence,minimum_transaction_pence,processing_cost_payer,created_by_user_id) VALUES('product',NULL,'professional',1000,0,0,1,'platform',$1)",
    [users.owner],
  );
  await db.query(
    "INSERT INTO beauty.financial_ledger_accounts(code,normal_balance) VALUES('provider_clearing','debit') ON CONFLICT DO NOTHING",
  );
  await db.query(
    "WITH a AS (INSERT INTO beauty.financial_ledger_accounts(professional_id,code,normal_balance) VALUES($1,'professional_pending','credit') RETURNING id), b AS (INSERT INTO beauty.financial_ledger_transactions(event_reference,kind,reference_type,professional_id) VALUES('visibility-fixture','admin_adjustment','admin',$1) RETURNING id) INSERT INTO beauty.financial_ledger_entries(transaction_id,account_id,amount_pence) SELECT b.id,a.id,-1000 FROM a,b UNION ALL SELECT b.id,(SELECT id FROM beauty.financial_ledger_accounts WHERE code='provider_clearing' AND professional_id IS NULL),1000 FROM b",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Visibility Service','Fixture appointment',60,6000,1800,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
  asset = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.portfolio_assets(professional_id,blob_path,mime_type,alt_text,publication_status,media_type) VALUES($1,'fixture/visibility.webp','image/webp','Published example image','published','image') RETURNING id",
      [pro],
    )
  ).rows[0].id;
  photo = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.profile_photos(professional_id,blob_path,alt_text) VALUES($1,'fixture/visibility-photo.webp','Published profile photo') RETURNING id",
      [pro],
    )
  ).rows[0].id;
  product = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.products(professional_id,name,price_pence,stock_quantity,publication_status) VALUES($1,'Visibility Product',1000,10,'published') RETURNING id",
      [pro],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.products(professional_id,name,price_pence,stock_quantity,publication_status) VALUES($1,'Draft Product',1000,10,'draft')",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.posts(professional_id,title,body,kind,publication_status,asset_id) VALUES($1,'Published example','Published example fixture post for testing','design','published',$2),($1,'Moderated example','Moderated example fixture post for testing','design','published',$2)",
    [pro, asset],
  );
  await db.query(
    "UPDATE beauty.posts SET moderation_status='hidden' WHERE title='Moderated example'",
  );
  await db.query(
    "INSERT INTO beauty.professional_stories(professional_id,asset_id,caption) VALUES($1,$2,'Published example')",
    [pro, asset],
  );
  booking = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Visibility Service','Fixture Client','Visibility Studio',now()-interval '2 days',now()-interval '2 days'+interval '1 hour',60,6000,1800,'completed',now()-interval '2 days') RETURNING id",
      [pro, users.customer, service],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO beauty.payments(booking_id,status) VALUES($1,'paid')",
    [booking],
  );
  await db.transaction((tx) =>
    as(tx, "visibility-customer", () =>
      tx.query(
        "INSERT INTO beauty.reviews(booking_id,rating,body,public_name) VALUES($1,5,'Excellent fixture appointment','Fixture Client')",
        [booking],
      ),
    ),
  );
  live = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.live_sessions(professional_id,room_name,status) VALUES($1,'ghlive_0123456789abcdef0123456789abcdef','live') RETURNING id",
      [pro],
    )
  ).rows[0].id;
});
afterAll(() => db.close());
it("hides all public content and direct media while retaining private records and publication settings", () =>
  isolated(async (tx) => {
    const before = await publicCounts(tx);
    expect(Object.values(before).every((n) => n === 1)).toBe(true);
    const preserved = await history(tx);
    const publication = (
      await tx.query(
        "SELECT publication_status FROM beauty.products ORDER BY id",
      )
    ).rows;
    await visibility(tx, true);
    expect(Object.values(await publicCounts(tx)).every((n) => n === 0)).toBe(
      true,
    );
    expect(await history(tx)).toEqual(preserved);
    expect(
      (
        await tx.query(
          "SELECT publication_status FROM beauty.products ORDER BY id",
        )
      ).rows,
    ).toEqual(publication);
    expect(
      (
        await as(tx, "visibility-pro", () =>
          tx.query("SELECT * FROM beauty.services WHERE id=$1", [service]),
        )
      ).rows,
    ).toHaveLength(1);
    const account = await as(tx, "visibility-pro", () =>
      findAccount(tx, "visibility-pro"),
    );
    expect(() => authorize(account, identity("visibility-pro"))).not.toThrow();
    await visibility(tx, false);
    expect(await publicCounts(tx)).toEqual(before);
    expect(
      (
        await tx.query("SELECT status FROM beauty.live_sessions WHERE id=$1", [
          live,
        ])
      ).rows[0].status,
    ).toBe("ended");
    expect(
      (
        await tx.query(
          "SELECT count(*)::int AS n FROM beauty.admin_audit_logs WHERE action IN('account.content.hidden','account.content.restored') AND target_user_id=$1",
          [users.pro],
        )
      ).rows[0].n,
    ).toBe(2);
  }));
it("hides a customer's verified-booking reviews without changing their booking", () =>
  isolated(async (tx) => {
    const before = await history(tx);
    await visibility(tx, true, users.customer);
    expect(
      (
        await tx.query(
          "SELECT * FROM beauty.public_reviews WHERE professional_id=$1",
          [pro],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await tx.query(
          "SELECT * FROM beauty.public_professionals WHERE id=$1",
          [pro],
        )
      ).rows,
    ).toHaveLength(1);
    expect(await history(tx)).toEqual(before);
    await visibility(tx, false, users.customer);
    expect(
      (
        await tx.query(
          "SELECT * FROM beauty.public_reviews WHERE professional_id=$1",
          [pro],
        )
      ).rows,
    ).toHaveLength(1);
  }));
it("requires verified Owner access and protects every Owner including self", () =>
  isolated(async (tx) => {
    for (const [auth, verified] of [
      ["visibility-pro", true],
      ["visibility-admin", true],
      ["visibility-owner", false],
    ] as const) {
      for (const sql of [
        "SELECT beauty.owner_set_account_visibility($1,true,'Forbidden fixture action')",
        "SELECT beauty.owner_remove_account($1,'Forbidden fixture action')",
        "SELECT beauty.owner_finish_auth_cleanup($1)",
      ])
        await expect(
          as(
            tx,
            auth,
            () => tx.query(sql, [users.pro]),
            "beauty_app",
            verified,
          ),
        ).rejects.toThrow("FORBIDDEN");
    }
    for (const target of [users.owner]) {
      await expect(visibility(tx, true, target)).rejects.toThrow("FORBIDDEN");
      await expect(
        as(tx, "visibility-owner", () =>
          tx.query(
            "SELECT beauty.owner_remove_account($1,'Protect fixture Owner')",
            [target],
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }
    await expect(
      as(tx, "visibility-pro", () =>
        tx.query("UPDATE beauty.users SET public_hidden_at=NULL WHERE id=$1", [
          users.pro,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(
        tx,
        "",
        () =>
          tx.query(
            "SELECT beauty.owner_set_account_visibility($1,true,'Anonymous fixture action')",
            [users.pro],
          ),
        "anon",
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(tx, "visibility-owner", () =>
        tx.query("SELECT beauty.owner_set_account_visibility($1,true,'bad')", [
          users.pro,
        ]),
      ),
    ).rejects.toThrow("INVALID_REQUEST");
  }));
it("blocks new service policies and purchases while allowing hidden cart items to be removed", () =>
  isolated(async (tx) => {
    await as(tx, "", () =>
      tx.query("SELECT beauty.public_service_policy($1,NULL,'{}')", [service]),
    );
    await as(tx, "visibility-customer", () =>
      tx.query("SELECT beauty.set_cart_item($1,1)", [product]),
    );
    await visibility(tx, true);
    await expect(
      as(tx, "", () =>
        tx.query("SELECT beauty.public_service_policy($1,NULL,'{}')", [
          service,
        ]),
      ),
    ).rejects.toThrow(/UNAVAILABLE_SERVICE/);
    await expect(
      as(tx, "visibility-customer", () =>
        tx.query("SELECT beauty.set_cart_item($1,2)", [product]),
      ),
    ).rejects.toThrow("CART_UNAVAILABLE");
    await expect(
      as(tx, "visibility-customer", () =>
        tx.query("SELECT beauty.prepare_shop_checkout()"),
      ),
    ).rejects.toThrow("CART_UNAVAILABLE");
    expect(
      (
        await tx.query(
          "SELECT stock_quantity FROM beauty.products WHERE id=$1",
          [product],
        )
      ).rows[0].stock_quantity,
    ).toBe(10);
    await as(tx, "visibility-customer", () =>
      tx.query("SELECT beauty.set_cart_item($1,0)", [product]),
    );
    expect(
      (await tx.query("SELECT * FROM beauty.cart_items")).rows,
    ).toHaveLength(0);
    await visibility(tx, false);
    await as(tx, "", () =>
      tx.query("SELECT beauty.public_service_policy($1,NULL,'{}')", [service]),
    );
  }));
it("stops LIVE without changing genuine verification", () =>
  isolated(async (tx) => {
    await visibility(tx, true);
    const eligibility = (
      await as(tx, "visibility-pro", () =>
        tx.query<{ data: { eligible: boolean; verified: boolean } }>(
          "SELECT beauty.live_eligibility($1) AS data",
          [pro],
        ),
      )
    ).rows[0].data;
    expect(eligibility).toMatchObject({ eligible: false, verified: true });
    await expect(
      as(tx, "visibility-customer", () =>
        tx.query("SELECT beauty.live_session_join_info($1)", [live]),
      ),
    ).rejects.toThrow(/NOT_FOUND|UNAVAILABLE/);
  }));
it("deletes platform access idempotently with durable cleanup status and retained transactions", () =>
  isolated(async (tx) => {
    const before = await history(tx);
    for (let i = 0; i < 2; i++) {
      const data = (
        await as(tx, "visibility-owner", () =>
          tx.query<{ data: { authId: string; authCleanupPending: boolean } }>(
            "SELECT beauty.owner_remove_account($1,'Remove fixture account') AS data",
            [users.pro],
          ),
        )
      ).rows[0].data;
      expect(data).toEqual({
        authId: "visibility-pro",
        authCleanupPending: true,
      });
    }
    expect(await history(tx)).toEqual(before);
    expect(Object.values(await publicCounts(tx)).every((n) => n === 0)).toBe(
      true,
    );
    expect(
      (
        await tx.query("SELECT * FROM beauty.user_roles WHERE user_id=$1", [
          users.pro,
        ])
      ).rows,
    ).toHaveLength(0);
    const account = await as(tx, "visibility-pro", () =>
      findAccount(tx, "visibility-pro"),
    );
    expect(() => authorize(account, identity("visibility-pro"))).toThrow(
      "ACCOUNT_INACTIVE",
    );
    await expect(
      as(tx, "visibility-pro", () =>
        ensureCustomerAccount(tx, identity("visibility-pro")),
      ),
    ).rejects.toThrow("ACCOUNT_INACTIVE");
    await expect(visibility(tx, false)).rejects.toThrow("NOT_FOUND");
    expect(
      (
        await tx.query(
          "SELECT * FROM beauty.admin_audit_logs WHERE action='account.deleted' AND target_user_id=$1",
          [users.pro],
        )
      ).rows,
    ).toHaveLength(1);
    for (let i = 0; i < 2; i++)
      await as(tx, "visibility-owner", () =>
        tx.query("SELECT beauty.owner_finish_auth_cleanup($1)", [users.pro]),
      );
    expect(
      (
        await tx.query(
          "SELECT auth_cleanup_pending FROM beauty.users WHERE id=$1",
          [users.pro],
        )
      ).rows[0].auth_cleanup_pending,
    ).toBe(false);
    expect(
      (
        await tx.query(
          "SELECT * FROM beauty.admin_audit_logs WHERE action='account.auth.deleted' AND target_user_id=$1",
          [users.pro],
        )
      ).rows,
    ).toHaveLength(1);
  }));
