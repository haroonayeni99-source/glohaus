import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import {
  simulateCommission,
  commissionActionSchema,
  simulationSchema,
} from "@/modules/commission/domain";
const db = await createTestDatabase();
let pro: string;
let customer: string;
let service: string;
async function as<T>(
  tx: SqlClient,
  id: string,
  work: () => Promise<T>,
  role = "beauty_app",
  mfa = true,
) {
  await tx.query("SAVEPOINT role_call");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query(
    "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
    [id, String(mfa)],
  );
  try {
    const result = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT role_call");
    return result;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT role_call");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT role_call");
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
async function action(tx: SqlClient, body: Record<string, unknown>) {
  return as(
    tx,
    "commission-owner",
    async () =>
      (
        await tx.query<{ data: { ruleId: string } }>(
          "SELECT beauty.owner_commission_action($1::jsonb) AS data",
          [
            JSON.stringify({
              reason: "Isolated commission test",
              confirmed: true,
              ...body,
            }),
          ],
        )
      ).rows[0].data,
  );
}
async function activate(tx: SqlClient) {
  await action(tx, { action: "activation", enabled: true });
}
const tomorrow = () => new Date(Date.now() + 25 * 3600000).toISOString();
const end = () => new Date(Date.now() + 10 * 86400000).toISOString();
async function rule(
  tx: SqlClient,
  bps: number,
  kind = "platform",
  scope = "all",
) {
  return (
    await action(tx, {
      action: "create",
      kind,
      professionalId: kind === "individual" ? pro : null,
      scope,
      basisPoints: bps,
      startsAt: tomorrow(),
      endsAt: end(),
    })
  ).ruleId;
}
async function nowRule(
  tx: SqlClient,
  bps: number,
  kind = "platform",
  scope = "all",
) {
  const id = await rule(tx, bps, kind, scope);
  await tx.query(
    "UPDATE beauty.commission_rules SET starts_at=now()-interval '1 day' WHERE id=$1",
    [id],
  );
  // Advance this disposable fixture's notice clock alongside its start time.
  await tx.query(
    "UPDATE beauty.commission_notices SET created_at=now()-interval '2 days' WHERE rule_id=$1",
    [id],
  );
  return id;
}
async function resolve(tx: SqlClient, at = new Date().toISOString()) {
  return as(
    tx,
    "commission-owner",
    async () =>
      (
        await tx.query<{
          data: {
            rule: {
              basisPoints: number;
              ruleId: string | null;
              standardBasisPoints: number;
              ruleReference: string;
            };
            fee: number;
            verified: boolean;
          };
        }>("SELECT beauty.owner_simulate_commission_rule($1,$2) AS data", [
          pro,
          at,
        ])
      ).rows[0].data,
  );
}
async function booking(tx: SqlClient) {
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at) VALUES($1,$2,$3,'Service','Customer','Pro',now()+interval '20 days',now()+interval '20 days 1 hour',60,5000,2000,'payment_pending',now()+interval '35 minutes') RETURNING id`,
      [pro, customer, service],
    )
  ).rows[0].id;
  await tx.query("INSERT INTO beauty.payments(booking_id) VALUES($1)", [id]);
  return id;
}
async function quote(tx: SqlClient, id: string) {
  return as(
    tx,
    "commission-customer",
    async () =>
      (
        await tx.query<{
          q: {
            customerTotalPence: number;
            professionalPlatformFeePence: number;
            professionalProceedsPence: number;
          };
        }>("SELECT beauty.prepare_booking_financial_quote($1) AS q", [id])
      ).rows[0].q,
  );
}
async function paid(tx: SqlClient, id: string, amount = 2100) {
  await as(tx, "commission-customer", () =>
    tx.query("SELECT beauty.attach_checkout($1,$2)", [id, "cs_" + id]),
  );
  await as(
    tx,
    "",
    async () => {
      await tx.query(
        "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
        ["evt_" + id, id, "cs_" + id, "pi_" + id, amount, "gbp"],
      );
      await tx.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
        id,
        "pi_" + id,
      ]);
    },
    "beauty_payment_worker",
  );
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const id of [
    "commission-pro",
    "commission-customer",
    "commission-owner",
    "commission-admin",
  ]) {
    const account = await db.transaction(async (tx) =>
      as(tx, id, () =>
        enrolAccount(
          tx,
          {
            authId: id,
            email: `${id}@example.test`,
            displayName: id,
            secondFactorAge: null,
          },
          id === "commission-pro" ? "professional" : "customer",
        ),
      ),
    );
    if (id === "commission-pro") pro = account.professionalId!;
    if (id === "commission-customer") customer = account.id;
    if (id === "commission-owner" || id === "commission-admin")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,$2)",
        [account.id, id === "commission-owner" ? "owner" : "admin"],
      );
  }
  await db.query(
    "UPDATE beauty.professional_profiles SET slug='commission-studio',business_name='Commission Studio',bio='Professional beauty services in London',city='London',category='Nails',publication_status='published' WHERE id=$1",
    [pro],
  );
  await db.query(
    "INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",
    [pro],
  );
  service = (
    await db.query<{ id: string }>(
      "INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Service','',60,5000,2000,true) RETURNING id",
      [pro],
    )
  ).rows[0].id;
});
afterAll(() => db.close());
describe("Commission Control Centre database boundaries", () => {
  it("ships disabled and preserves live standard rates", () =>
    isolated(async (tx) => {
      expect(
        (
          await tx.query<{ enabled: boolean }>(
            "SELECT enabled FROM beauty.commission_settings",
          )
        ).rows[0].enabled,
      ).toBe(false);
      expect((await resolve(tx)).rule.basisPoints).toBe(800);
      await tx.query(
        "UPDATE beauty.professional_trust_status SET verification_status='unverified' WHERE professional_id=$1",
        [pro],
      );
      expect((await resolve(tx)).rule.basisPoints).toBe(1000);
    }));
  it("denies ordinary admin, professional, anonymous and missing MFA activation", async () => {
    for (const [id, mfa] of [
      ["commission-admin", true],
      ["commission-pro", true],
      ["", true],
      ["commission-owner", false],
    ] as const) {
      await expect(
        isolated((tx) =>
          as(
            tx,
            id,
            async () => {
              await tx.query(
                `SELECT beauty.owner_commission_action('{"action":"activation","enabled":true,"confirmed":true,"reason":"Denied test"}')`,
              );
            },
            "beauty_app",
            mfa,
          ),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }
  });
  it("requires server confirmation", () =>
    isolated(async (tx) => {
      await expect(
        as(tx, "commission-owner", () =>
          tx.query(
            `SELECT beauty.owner_commission_action('{"action":"activation","enabled":true,"reason":"Denied test"}')`,
          ),
        ),
      ).rejects.toThrow("CONFIRMATION_REQUIRED");
    }));
  it("prevents changes while Centre is disabled", () =>
    isolated(async (tx) => {
      await expect(rule(tx, 0)).rejects.toThrow("CONTROL_DISABLED");
    }));
  it("rejects past/immediate rules and invalid percentages", async () => {
    for (const bps of [-1, 5001, 0])
      await expect(
        isolated(async (tx) => {
          await activate(tx);
          await action(tx, {
            action: "create",
            kind: "platform",
            scope: "all",
            basisPoints: bps,
            startsAt: new Date().toISOString(),
            endsAt: end(),
          });
        }),
      ).rejects.toThrow("INVALID_COMMISSION_RULE");
  });
  for (const bps of [0, 200, 800])
    it(`prices and reconciles ${bps / 100}% with immutable snapshots`, () =>
      isolated(async (tx) => {
        await activate(tx);
        const ruleId = await nowRule(tx, bps);
        const id = await booking(tx);
        const q = await quote(tx, id);
        expect(q.customerTotalPence).toBe(2100);
        expect(q.professionalPlatformFeePence).toBe(bps / 2);
        expect(q.professionalProceedsPence).toBe(2000 - bps / 2);
        const terms = (
          await tx.query<{
            basis_points: number;
            commission_pence: number;
            rule_id: string;
            pricing_version: string;
          }>(
            "SELECT * FROM beauty.payment_commission_terms WHERE booking_id=$1",
            [id],
          )
        ).rows[0];
        expect(terms).toMatchObject({
          basis_points: bps,
          commission_pence: bps / 2,
          rule_id: ruleId,
          pricing_version: "commission-v2",
        });
        await tx.query(
          "UPDATE beauty.commission_rules SET basis_points=500 WHERE id=$1",
          [ruleId],
        );
        expect(await quote(tx, id)).toEqual(q);
        await paid(tx, id);
        const wallet = await as(
          tx,
          "commission-pro",
          async () =>
            (
              await tx.query<{ data: { pendingPence: number } }>(
                "SELECT beauty.my_wallet_overview() AS data",
              )
            ).rows[0].data,
        );
        expect(wallet.pendingPence).toBe(2000 - bps / 2);
        await as(
          tx,
          "",
          () =>
            tx.query(
              "SELECT beauty.reconcile_booking_provider_cost($1,$2,$3,2100,52,$4)",
              [id, "pi_" + id, "txn_" + id, "gbp"],
            ),
          "beauty_payment_worker",
        );
        await as(
          tx,
          "",
          () =>
            tx.query(
              "SELECT beauty.reconcile_booking_provider_cost($1,$2,$3,2100,52,$4)",
              [id, "pi_" + id, "txn_" + id, "gbp"],
            ),
          "beauty_payment_worker",
        );
        expect(
          (
            await tx.query<{ n: number }>(
              "SELECT count(*)::int AS n FROM beauty.booking_provider_costs",
            )
          ).rows[0].n,
        ).toBe(1);
      }));
  it("applies individual overrides before overlapping platform rules", () =>
    isolated(async (tx) => {
      await activate(tx);
      await nowRule(tx, 0);
      const id = await nowRule(tx, 200, "individual");
      expect((await resolve(tx)).rule).toMatchObject({
        basisPoints: 200,
        ruleId: id,
      });
    }));
  it("respects eligibility scopes", () =>
    isolated(async (tx) => {
      await activate(tx);
      await nowRule(tx, 0, "platform", "unverified");
      expect((await resolve(tx)).rule.basisPoints).toBe(800);
      await nowRule(tx, 200, "platform", "verified");
      expect((await resolve(tx)).rule.basisPoints).toBe(200);
    }));
  it("uses half-open starts/expiry without any expiry job", () =>
    isolated(async (tx) => {
      await activate(tx);
      const id = await rule(tx, 200);
      const r = (
        await tx.query<{ starts_at: string; ends_at: string }>(
          "SELECT starts_at,ends_at FROM beauty.commission_rules WHERE id=$1",
          [id],
        )
      ).rows[0];
      expect(
        (
          await resolve(
            tx,
            new Date(new Date(r.starts_at).getTime() - 1).toISOString(),
          )
        ).rule.basisPoints,
      ).toBe(800);
      expect(
        (await resolve(tx, new Date(r.starts_at).toISOString())).rule
          .basisPoints,
      ).toBe(200);
      expect(
        (await resolve(tx, new Date(r.ends_at).toISOString())).rule.basisPoints,
      ).toBe(800);
    }));
  it("records notices before payable rules take effect and audits actor and values", () =>
    isolated(async (tx) => {
      await activate(tx);
      const id = await rule(tx, 200);
      const notice = (
        await tx.query<{ created_at: string; effective_at: string }>(
          "SELECT created_at,effective_at FROM beauty.commission_notices WHERE rule_id=$1",
          [id],
        )
      ).rows[0];
      expect(
        new Date(notice.effective_at).getTime() -
          new Date(notice.created_at).getTime(),
      ).toBeGreaterThanOrEqual(86400000);
      expect(
        (
          await tx.query<{ n: number }>(
            "SELECT count(*)::int n FROM beauty.in_app_notifications WHERE kind='commission_changed'",
          )
        ).rows[0].n,
      ).toBeGreaterThan(0);
      const audit = (
        await tx.query<{
          new_state: { basis_points: number };
          actor_user_id: string;
        }>(
          "SELECT * FROM beauty.financial_admin_audit_logs WHERE action='commission.create'",
        )
      ).rows[0];
      expect(audit.new_state.basis_points).toBe(200);
      expect(audit.actor_user_id).toBeTruthy();
    }));
  it("blocks commission greater than the deposit without producing a negative wallet", () =>
    isolated(async (tx) => {
      await activate(tx);
      await nowRule(tx, 5000);
      await expect(booking(tx)).rejects.toThrow("COMMISSION_EXCEEDS_DEPOSIT");
    }));
  it("denies customer reads of commission/payment snapshots and Owner reports", () =>
    isolated(async (tx) => {
      await activate(tx);
      const id = await booking(tx);
      await quote(tx, id);
      await expect(
        as(tx, "commission-customer", () =>
          tx.query("SELECT * FROM beauty.booking_commission_terms"),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        as(tx, "commission-customer", () =>
          tx.query("SELECT * FROM beauty.payment_commission_terms"),
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        as(tx, "commission-customer", () =>
          tx.query("SELECT beauty.owner_commission_overview()"),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }));
  it("lets only the professional view their commission details", () =>
    isolated(async (tx) => {
      await activate(tx);
      await nowRule(tx, 0);
      await booking(tx);
      const overview = await as(
        tx,
        "commission-pro",
        async () =>
          (
            await tx.query<{
              data: { effective: { basisPoints: number }; bookings: unknown[] };
            }>("SELECT beauty.my_commission_overview() AS data")
          ).rows[0].data,
      );
      expect(overview.effective.basisPoints).toBe(0);
      expect(overview.bookings).toHaveLength(1);
    }));
  it("rejects Stripe fee reconciliation with wrong charge, intent, currency or negative fee", async () => {
    for (const [intent, amount, fee, currency] of [
      ["pi_wrong", 2100, 52, "gbp"],
      ["correct", 2200, 52, "gbp"],
      ["correct", 2100, -1, "gbp"],
      ["correct", 2100, 52, "usd"],
    ] as const)
      await expect(
        isolated(async (tx) => {
          await activate(tx);
          const id = await booking(tx);
          await quote(tx, id);
          await paid(tx, id);
          await as(
            tx,
            "",
            () =>
              tx.query(
                "SELECT beauty.reconcile_booking_provider_cost($1,$2,$3,$4,$5,$6)",
                [
                  id,
                  intent === "correct" ? "pi_" + id : intent,
                  "txn_test",
                  amount,
                  fee,
                  currency,
                ],
              ),
            "beauty_payment_worker",
          );
        }),
      ).rejects.toThrow("PAYMENT_MISMATCH");
  });
  it("cancellation retains agreed terms and restores standard only for new quotes", () =>
    isolated(async (tx) => {
      await activate(tx);
      const id = await rule(tx, 0);
      const cancellation = tomorrow();
      await action(tx, {
        action: "cancel",
        ruleId: id,
        cancelledFrom: cancellation,
      });
      expect(
        (
          await resolve(
            tx,
            new Date(new Date(cancellation).getTime() + 1).toISOString(),
          )
        ).rule.basisPoints,
      ).toBe(800);
      const audit = (
        await tx.query<{
          previous_state: { cancelled_from: null };
          new_state: { cancelled_from: string };
        }>(
          "SELECT * FROM beauty.financial_admin_audit_logs WHERE action='commission.cancel'",
        )
      ).rows[0];
      expect(audit.previous_state.cancelled_from).toBeNull();
      expect(audit.new_state.cancelled_from).toBeTruthy();
    }));
  it("Test Mode makes no financial/database changes", () =>
    isolated(async (tx) => {
      await activate(tx);
      await rule(tx, 0);
      const before = JSON.stringify(
        (
          await tx.query(
            "SELECT (SELECT count(*) FROM beauty.bookings) bookings,(SELECT count(*) FROM beauty.payments) payments,(SELECT count(*) FROM beauty.financial_ledger_transactions) ledger",
          )
        ).rows,
      );
      await resolve(tx, tomorrow());
      const after = JSON.stringify(
        (
          await tx.query(
            "SELECT (SELECT count(*) FROM beauty.bookings) bookings,(SELECT count(*) FROM beauty.payments) payments,(SELECT count(*) FROM beauty.financial_ledger_transactions) ledger",
          )
        ).rows,
      );
      expect(after).toBe(before);
    }));
  it("14+30 founding rewards require questionnaire and participation; emergency pause preserves rewards", () =>
    isolated(async (tx) => {
      await activate(tx);
      const trial = (
        await action(tx, {
          action: "enrol",
          professionalId: pro,
          startsAt: tomorrow(),
        })
      ).ruleId;
      let t = (
        await tx.query<{ starts_at: string; ends_at: string }>(
          "SELECT starts_at,ends_at FROM beauty.commission_rules WHERE id=$1",
          [trial],
        )
      ).rows[0];
      expect(
        new Date(t.ends_at).getTime() - new Date(t.starts_at).getTime(),
      ).toBe(14 * 86400000);
      await expect(
        action(tx, { action: "qualify", professionalId: pro }),
      ).rejects.toThrow("FOUNDING_EXTENSION_NOT_AVAILABLE");
      // Explicitly model a participant promised the historical extension.
      await tx.query("UPDATE beauty.founding_participants SET legacy_extension_eligible=true WHERE professional_id=$1", [pro]);
      await expect(action(tx, { action: "qualify", professionalId: pro })).rejects.toThrow("QUESTIONNAIRE_REQUIRED");
      await tx.query(
        "UPDATE beauty.commission_rules SET starts_at=now()-interval '11 days',ends_at=now()+interval '3 days' WHERE id=$1",
        [trial],
      );
      await as(tx, "commission-pro", () =>
        tx.query("SELECT beauty.submit_founding_questionnaire($1::jsonb)", [
          JSON.stringify({
            experience: "The experience was frustrating",
            improve: "Fix booking and navigation please",
            useAgain: "Not yet",
          }),
        ]),
      );
      await expect(
        action(tx, { action: "qualify", professionalId: pro }),
      ).rejects.toThrow("PARTICIPATION_REQUIRED");
      await tx.query(
        "INSERT INTO beauty.posts(professional_id,kind,title,body,publication_status) VALUES($1,'design','Trial post','My work posted during the founding programme','published')",
        [pro],
      );
      await action(tx, { action: "emergency", enabled: false });
      await expect(rule(tx, 200)).rejects.toThrow("PROMOTIONS_STOPPED");
      const reward = (
        await action(tx, { action: "qualify", professionalId: pro })
      ).ruleId;
      expect(
        (await action(tx, { action: "qualify", professionalId: pro })).ruleId,
      ).toBe(reward);
      const rewardTerms = (
        await tx.query<{ starts_at: string; ends_at: string }>(
          "SELECT starts_at,ends_at FROM beauty.commission_rules WHERE id=$1",
          [reward],
        )
      ).rows[0];
      t = (
        await tx.query<{ starts_at: string; ends_at: string }>(
          "SELECT starts_at,ends_at FROM beauty.commission_rules WHERE id=$1",
          [trial],
        )
      ).rows[0];
      expect(new Date(rewardTerms.starts_at).getTime()).toBe(
        new Date(t.ends_at).getTime(),
      );
      expect(
        new Date(rewardTerms.ends_at).getTime() -
          new Date(rewardTerms.starts_at).getTime(),
      ).toBe(30 * 86400000);
      expect(
        (await resolve(tx, new Date(rewardTerms.starts_at).toISOString())).rule
          .basisPoints,
      ).toBe(0);
      expect(
        (await resolve(tx, new Date(rewardTerms.ends_at).toISOString())).rule
          .basisPoints,
      ).toBe(800);
      await expect(
        action(tx, {
          action: "cancel",
          ruleId: reward,
          cancelledFrom: tomorrow(),
        }),
      ).rejects.toThrow("CONTRACTUAL_REWARD_PROTECTED");
    }));
  it("founding 0% wins over an individual paid override", () =>
    isolated(async (tx) => {
      await activate(tx);
      const id = (
        await action(tx, {
          action: "enrol",
          professionalId: pro,
          startsAt: tomorrow(),
        })
      ).ruleId;
      await tx.query(
        "UPDATE beauty.commission_rules SET starts_at=now()-interval '1 day' WHERE id=$1",
        [id],
      );
      await nowRule(tx, 200, "individual");
      expect((await resolve(tx)).rule).toMatchObject({
        basisPoints: 0,
        ruleId: id,
      });
    }));
});
describe("integer financial simulation", () => {
  const input = {
    professionalId: "00000000-0000-4000-8000-000000000001",
    atTime: tomorrow(),
    servicePence: 5000,
    depositPence: 2000,
    bookings: 5,
    providerBasisPoints: 150,
    providerFixedPence: 20,
    refundPence: 0,
  };
  for (const bps of [0, 200, 800])
    it(`simulates ${bps / 100}% with rounded pence and unchanged customer fee`, () => {
      const result = simulateCommission(
        input,
        {
          basisPoints: bps,
          standardBasisPoints: 800,
          ruleId: null,
          ruleReference: "test",
          pricingVersion: "v2",
          expiresAt: null,
        },
        100,
        true,
      );
      expect(result.commissionPence).toBe(bps / 2);
      expect(result.chargePence).toBe(2100);
      expect(result.providerCostPence).toBe(52);
      expect(result.totalCommissionPence).toBe((bps / 2) * 5);
      expect(result.problems).toEqual([]);
    });
  it("shows platform loss and refund obligations without a negative wallet", () => {
    const result = simulateCommission(
      { ...input, refundPence: 2100, providerBasisPoints: 500 },
      {
        basisPoints: 0,
        standardBasisPoints: 800,
        ruleId: null,
        ruleReference: "test",
        pricingVersion: "v2",
        expiresAt: null,
      },
      100,
      true,
    );
    expect(result.professionalAfterRefundPence).toBe(0);
    expect(result.refundObligationPence).toBe(100);
    expect(result.platformNetPence).toBeLessThan(0);
  });
  it("rejects negative and fractional-penny inputs at the server boundary", () => {
    expect(
      simulationSchema.safeParse({ ...input, depositPence: -1 }).success,
    ).toBe(false);
    expect(
      simulationSchema.safeParse({ ...input, servicePence: 5000.5 }).success,
    ).toBe(false);
    expect(
      commissionActionSchema.safeParse({
        action: "activation",
        enabled: true,
        confirmed: false,
        reason: "Invalid test",
      }).success,
    ).toBe(false);
  });
});

describe("promoted refunds, payouts and reporting", () => {
  for (const bps of [0, 200, 800])
    it(`protects refunds and ledger balances at ${bps / 100}%`, () =>
      isolated(async (tx) => {
        await activate(tx);
        await nowRule(tx, bps);
        const id = await booking(tx);
        await quote(tx, id);
        await paid(tx, id);
        await tx.query(
          "UPDATE beauty.bookings SET status='cancelled',cancellation_actor='professional',cancelled_at=now(),cancellation_reason='Fixture cancellation' WHERE id=$1",
          [id],
        );
        const decision = await as(
          tx,
          "commission-pro",
          async () =>
            (
              await tx.query<{ data: { id: string } }>(
                "SELECT beauty.decide_refund($1,true,100,'Professional cancellation in isolated test') AS data",
                [id],
              )
            ).rows[0].data.id,
        );
        await as(
          tx,
          "",
          async () => {
            await tx.query(
              "SELECT beauty.apply_refund_result($1,$2,2100,'succeeded',$3)",
              [decision, "re_" + id, "pi_" + id],
            );
            await tx.query("SELECT beauty.record_booking_refund_finance($1)", [
              decision,
            ]);
            await tx.query("SELECT beauty.record_booking_refund_finance($1)", [
              decision,
            ]);
          },
          "beauty_payment_worker",
        );
        const wallet = await as(
          tx,
          "commission-pro",
          async () =>
            (
              await tx.query<{
                data: {
                  pendingPence: number;
                  availablePence: number;
                  outstandingObligationPence: number;
                };
              }>("SELECT beauty.my_wallet_overview() AS data")
            ).rows[0].data,
        );
        expect(wallet.pendingPence).toBe(0);
        expect(wallet.availablePence).toBe(0);
        expect(wallet.outstandingObligationPence).toBe(100 + bps / 2);
        const terms = (
          await tx.query<{ commission_pence: number }>(
            "SELECT commission_pence FROM beauty.payment_commission_terms WHERE booking_id=$1",
            [id],
          )
        ).rows[0];
        expect(terms.commission_pence).toBe(bps / 2);
        const revenue = (
          await tx.query<{ revenue: number }>(
            "SELECT -sum(e.amount_pence)::int revenue FROM beauty.financial_ledger_entries e JOIN beauty.financial_ledger_accounts a ON a.id=e.account_id WHERE a.code='platform_fee_revenue'",
          )
        ).rows[0].revenue;
        expect(revenue).toBe(100 + bps / 2);
      }));
  it("shows paid promotion performance and recorded costs only", () =>
    isolated(async (tx) => {
      await activate(tx);
      const ruleId = await nowRule(tx, 200);
      const id = await booking(tx);
      await quote(tx, id);
      await paid(tx, id);
      await as(
        tx,
        "",
        () =>
          tx.query(
            "SELECT beauty.reconcile_booking_provider_cost($1,$2,$3,2100,52,'gbp')",
            [id, "pi_" + id, "txn_" + id],
          ),
        "beauty_payment_worker",
      );
      const overview = await as(
        tx,
        "commission-owner",
        async () =>
          (
            await tx.query<{
              data: {
                metrics: {
                  commissionEarnedPence: number;
                  waivedPence: number;
                  paymentCostsPence: number;
                  costsPending: number;
                };
                performance: {
                  rule_reference: string;
                  paid_bookings: number;
                }[];
              };
            }>("SELECT beauty.owner_commission_overview() AS data")
          ).rows[0].data,
      );
      expect(overview.metrics).toMatchObject({
        commissionEarnedPence: 100,
        waivedPence: 300,
        paymentCostsPence: 52,
        costsPending: 0,
      });
      expect(overview.performance[0]).toMatchObject({
        rule_reference: ruleId,
        paid_bookings: 1,
      });
    }));
  it("ignores unpaid cancellations in promotional revenue", () =>
    isolated(async (tx) => {
      await activate(tx);
      await nowRule(tx, 0);
      const id = await booking(tx);
      await quote(tx, id);
      await tx.query(
        "UPDATE beauty.bookings SET status='cancelled',cancellation_actor='customer',cancelled_at=now() WHERE id=$1",
        [id],
      );
      const o = await as(
        tx,
        "commission-owner",
        async () =>
          (
            await tx.query<{
              data: {
                metrics: { commissionEarnedPence: number; waivedPence: number };
              };
            }>("SELECT beauty.owner_commission_overview() AS data")
          ).rows[0].data,
      );
      expect(o.metrics).toMatchObject({
        commissionEarnedPence: 0,
        waivedPence: 0,
      });
    }));
  it("preserves a legacy individual agreement above a global offer", () =>
    isolated(async (tx) => {
      await activate(tx);
      const owner = (
        await tx.query<{ id: string }>(
          "SELECT id FROM beauty.users WHERE auth_id='commission-owner'",
        )
      ).rows[0].id;
      await tx.query(
        "INSERT INTO beauty.professional_commission_overrides(professional_id,service_commission_basis_points,reason,updated_by_user_id) VALUES($1,200,'Existing agreement', $2)",
        [pro, owner],
      );
      await nowRule(tx, 0);
      expect((await resolve(tx)).rule.basisPoints).toBe(200);
    }));
  it("keeps standard paid rates when there is no applicable promotion", () =>
    isolated(async (tx) => {
      await activate(tx);
      for (const [plan, rate] of [
        ["starter", 800],
        ["pro", 600],
        ["premium", 400],
      ] as const) {
        await tx.query(
          "INSERT INTO beauty.professional_subscriptions(professional_id,plan_key,status,accepted_terms_version,accepted_at) VALUES($1,$2,'active','professional-pricing-v1',now()) ON CONFLICT(professional_id) DO UPDATE SET plan_key=excluded.plan_key,status='active'",
          [pro, plan],
        );
        expect((await resolve(tx)).rule.basisPoints).toBe(rate);
      }
    }));
  it("offers hypothetical 0%, 2% and standard scenarios without changing the resolved rule", () => {
    const input = {
      professionalId: pro,
      atTime: tomorrow(),
      servicePence: 5000,
      depositPence: 2000,
      bookings: 1,
      providerBasisPoints: 150,
      providerFixedPence: 20,
      refundPence: 0,
    };
    const rule = {
      basisPoints: 200,
      standardBasisPoints: 800,
      ruleId: null,
      ruleReference: "existing",
      pricingVersion: "v2",
      expiresAt: null,
    };
    for (const [scenario, expected] of [
      ["zero", 0],
      ["two", 200],
      ["standard", 800],
    ] as const) {
      expect(
        simulateCommission({ ...input, scenario }, rule, 100, true).rule
          .basisPoints,
      ).toBe(expected);
    }
    expect(rule.basisPoints).toBe(200);
  });
});

describe("notification and private-schema protections", () => {
  it("claims and finishes commission email notices only through the payment worker", () =>
    isolated(async (tx) => {
      await activate(tx);
      await rule(tx, 200);
      const jobs = await as(
        tx,
        "",
        async () =>
          (
            await tx.query<{ id: string; email: string; body: string }>(
              "SELECT * FROM beauty.claim_commission_notices()",
            )
          ).rows,
        "beauty_payment_worker",
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].email).toBe("commission-pro@example.test");
      expect(jobs[0].body).toContain("2.0000000000000000%");
      await as(
        tx,
        "",
        () =>
          tx.query("SELECT beauty.finish_commission_notice($1,$2)", [
            jobs[0].id,
            "email_fixture",
          ]),
        "beauty_payment_worker",
      );
      expect(
        (
          await tx.query<{ email_sent_at: string }>(
            "SELECT email_sent_at FROM beauty.commission_notices WHERE id=$1",
            [jobs[0].id],
          )
        ).rows[0].email_sent_at,
      ).toBeTruthy();
    }));
  it("allows no public function execution or browser snapshot mutation", () =>
    isolated(async (tx) => {
      const rows = (
        await tx.query<{ public_access: boolean; app_update: boolean }>(
          "SELECT has_function_privilege('anon','beauty.owner_commission_action(jsonb)','execute') public_access,has_table_privilege('beauty_app','beauty.booking_commission_terms','update') app_update",
        )
      ).rows[0];
      expect(rows).toEqual({ public_access: false, app_update: false });
    }));
  it("notifies a newly enrolled professional about existing global terms", () =>
    isolated(async (tx) => {
      await activate(tx);
      await rule(tx, 200);
      const account = await as(tx, "new-pro", () =>
        enrolAccount(
          tx,
          {
            authId: "new-pro",
            email: "new-pro@example.test",
            displayName: "New Pro",
            secondFactorAge: null,
          },
          "professional",
        ),
      );
      const notices = (
        await tx.query<{ n: number }>(
          "SELECT count(*)::int n FROM beauty.commission_notices WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0].n;
      expect(notices).toBe(1);
    }));
  it("waits for 24-hour notice before applying a higher payable rate", () =>
    isolated(async (tx) => {
      await activate(tx);
      const id = await rule(tx, 1000);
      await tx.query(
        "UPDATE beauty.commission_rules SET starts_at=now()-interval '1 hour' WHERE id=$1",
        [id],
      );
      const read = async () =>
        as(
          tx,
          "",
          async () =>
            (
              await tx.query<{ data: { basisPoints: number } }>(
                "SELECT beauty.resolve_service_commission($1) AS data",
                [pro],
              )
            ).rows[0].data,
          "beauty_financial_worker",
        );
      expect((await read()).basisPoints).toBe(800);
      await tx.query(
        "UPDATE beauty.commission_notices SET created_at=now()-interval '25 hours' WHERE rule_id=$1",
        [id],
      );
      expect((await read()).basisPoints).toBe(1000);
    }));
});
