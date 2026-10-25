import { beforeAll, afterAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
async function as<T>(
  tx: SqlClient,
  id: string,
  work: () => Promise<T>,
  mfa = true,
) {
  await tx.query("SAVEPOINT caller");
  await tx.query("SET LOCAL ROLE beauty_app");
  await tx.query(
    "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
    [id, String(mfa)],
  );
  try {
    const r = await work();
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT caller");
    return r;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT caller");
    await tx.query("RESET ROLE");
    await tx.query("RELEASE SAVEPOINT caller");
    throw e;
  }
}
async function isolated(work: (tx: SqlClient) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await work(tx);
      throw Error("ROLLBACK_FIXTURE");
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === "ROLLBACK_FIXTURE")) throw e;
  }
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const name of ["privacy-owner", "privacy-admin", "privacy-customer"]) {
    const account = await db.transaction((tx) =>
      as(tx, name, () =>
        enrolAccount(
          tx,
          {
            authId: name,
            email: name + "@example.test",
            displayName: name,
            secondFactorAge: null,
          },
          "customer",
        ),
      ),
    );
    if (name !== "privacy-customer")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
        [account.id],
      );
    if (name === "privacy-owner")
      await db.query(
        "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",
        [account.id],
      );
  }
});
afterAll(() => db.close());
async function ticket(tx: SqlClient, topic = "Privacy & data request") {
  return (
    await as(tx, "", () =>
      tx.query<{ id: string }>(
        "SELECT beauty.submit_support_request('Fixture Person','privacy@example.test',$1,'','A fictional request concerning personal account information',$2) AS id",
        [topic, "a".repeat(64)],
      ),
    )
  ).rows[0].id;
}
async function metadata(tx: SqlClient, id: string) {
  return (
    await as(tx, "privacy-owner", () =>
      tx.query<{
        data: {
          kind: string;
          identity: string;
          rightsDueAt: string;
          receivedOn: string;
          closedAt: string | null;
          holdReason: string;
        };
      }>("SELECT beauty.owner_support_operations($1) AS data", [id]),
    )
  ).rows[0].data;
}
async function review(
  tx: SqlClient,
  id: string,
  extra: Record<string, unknown> = {},
) {
  const current = await metadata(tx, id);
  return as(tx, "privacy-owner", () =>
    tx.query("SELECT beauty.owner_update_support_operations($1,$2::jsonb)", [
      id,
      JSON.stringify({
        kind: current.kind,
        identity: "verified",
        holdReason: "",
        nextReviewAt: "",
        receivedOn: current.receivedOn,
        reason: "Reviewed the existing account evidence proportionately",
        ...extra,
      }),
    ]),
  );
}
it("routes explicit privacy intake and protects identity/hold metadata behind Owner MFA", () =>
  isolated(async (tx) => {
    const id = await ticket(tx);
    expect((await metadata(tx, id)).kind).toBe("privacy_request");
    for (const role of ["", "privacy-admin", "privacy-customer"])
      await expect(
        as(tx, role, () =>
          tx.query("SELECT beauty.owner_support_operations($1)", [id]),
        ),
      ).rejects.toThrow();
    await expect(
      as(
        tx,
        "privacy-owner",
        () => tx.query("SELECT beauty.owner_support_operations($1)", [id]),
        false,
      ),
    ).rejects.toThrow();
    await as(tx, "", () =>
      tx.query("SELECT beauty.issue_support_access($1,$2,$3)", [
        id,
        "a".repeat(64),
        "b".repeat(64),
      ]),
    );
    const data = (
      await as(tx, "", () =>
        tx.query<{ data: object }>(
          "SELECT beauty.support_case($1,$2,false) AS data",
          [id, "b".repeat(64)],
        ),
      )
    ).rows[0].data;
    expect(JSON.stringify(data)).not.toMatch(
      /identity_review|holdReason|retention_hold_reason/,
    );
    expect(
      (
        await tx.query<{ allowed: boolean }>(
          "SELECT has_function_privilege('anon','beauty.owner_support_operations(uuid)','EXECUTE') OR has_function_privilege('authenticated','beauty.owner_update_support_operations(uuid,jsonb)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  }));
it("calculates calendar-month deadlines including month ends, leap years and complaint acknowledgement", async () => {
  for (const [received, kind, expected] of [
    ["2026-01-31T12:00:00Z", "access", "2026-02-28"],
    ["2024-01-31T12:00:00Z", "access", "2024-02-29"],
    ["2026-03-31T12:00:00Z", "erasure", "2026-04-30"],
    ["2026-10-25T12:00:00Z", "privacy_complaint", "2026-11-24"],
  ]) {
    expect(
      (
        await db.query<{ day: string }>(
          "SELECT to_char(beauty.support_rights_target($1,$2) AT TIME ZONE 'Europe/London','YYYY-MM-DD') AS day",
          [received, kind],
        )
      ).rows[0].day,
    ).toBe(expected);
  }
});
it("requires identity review, Owner decision and a customer-visible outcome before closing a data request", () =>
  isolated(async (tx) => {
    const id = await ticket(tx);
    await expect(
      as(tx, "privacy-owner", () =>
        tx.query(
          "SELECT beauty.admin_support_case_action($1,'resolved','A reasoned outcome for the requester',true)",
          [id],
        ),
      ),
    ).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
    await review(tx, id, { identity: "not_needed" });
    await expect(
      as(tx, "privacy-admin", () =>
        tx.query(
          "SELECT beauty.admin_support_case_action($1,'resolved','An ordinary admin cannot decide this case',true)",
          [id],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      as(tx, "privacy-owner", () =>
        tx.query(
          "SELECT beauty.admin_support_case_action($1,'resolved','A private note is not the final public outcome',false)",
          [id],
        ),
      ),
    ).rejects.toThrow("PUBLIC_OUTCOME_REQUIRED");
    await as(tx, "privacy-owner", () =>
      tx.query(
        "SELECT beauty.admin_support_case_action($1,'resolved','Explained the information supplied and lawful exceptions',true)",
        [id],
      ),
    );
    expect((await metadata(tx, id)).closedAt).not.toBeNull();
  }));
it("requires a review date for retention holds, rejects future receipt dates and records private audit history", () =>
  isolated(async (tx) => {
    const id = await ticket(tx);
    await expect(
      review(tx, id, {
        holdReason: "Evidence needed for an unresolved dispute",
      }),
    ).rejects.toThrow("HOLD_REVIEW_REQUIRED");
    const dates = (
      await tx.query<{ next: string; future: string }>(
        "SELECT (current_date+7)::text AS next,(current_date+1)::text AS future",
      )
    ).rows[0];
    await expect(review(tx, id, { receivedOn: dates.future })).rejects.toThrow(
      "INVALID_RECEIVED_DATE",
    );
    await review(tx, id, {
      holdReason: "Evidence needed for an unresolved dispute",
      nextReviewAt: dates.next,
    });
    expect((await metadata(tx, id)).holdReason).toContain("unresolved dispute");
    expect(
      (
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM beauty.financial_admin_audit_logs WHERE action='support.operations_review'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM beauty.support_request_events WHERE request_id=$1 AND public=false",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it("uses original email receipt dates and does not pause deadlines when awaiting a customer", () =>
  isolated(async (tx) => {
    const id = await ticket(tx);
    const original = (await metadata(tx, id)).rightsDueAt;
    const earlier = (
      await tx.query<{ day: string }>("SELECT (current_date-10)::text AS day")
    ).rows[0].day;
    await review(tx, id, { receivedOn: earlier });
    const due = (await metadata(tx, id)).rightsDueAt;
    expect(new Date(due).getTime()).toBeLessThan(new Date(original).getTime());
    await as(tx, "privacy-admin", () =>
      tx.query(
        "SELECT beauty.admin_support_case_action($1,'awaiting_customer','Asked promptly for proportionate clarification',true)",
        [id],
      ),
    );
    expect((await metadata(tx, id)).rightsDueAt).toBe(due);
  }));
it("queues overdue retention reviews, preserves holds and leaves fees and financial history unchanged", () =>
  isolated(async (tx) => {
    const snapshot = async () =>
      JSON.stringify(
        (
          await tx.query(
            "SELECT (SELECT jsonb_agg(r) FROM beauty.financial_fee_rules r) AS fees,(SELECT jsonb_agg(r) FROM beauty.commission_settings r) AS commission,(SELECT count(*) FROM beauty.financial_ledger_entries) AS ledger",
          )
        ).rows,
      );
    const before = await snapshot();
    const id = await ticket(tx, "Other");
    await as(tx, "privacy-admin", () =>
      tx.query(
        "SELECT beauty.admin_support_case_action($1,'resolved','A general support outcome was explained',true)",
        [id],
      ),
    );
    await tx.query(
      "UPDATE beauty.support_requests SET closed_at=now()-interval '91 days' WHERE id=$1",
      [id],
    );
    const queue = (
      await as(tx, "privacy-owner", () =>
        tx.query<{ data: { items: { id: string }[] } }>(
          "SELECT beauty.owner_support_operations(NULL) AS data",
        ),
      )
    ).rows[0].data;
    expect(queue.items.some((r) => r.id === id)).toBe(true);
    expect(await snapshot()).toBe(before);
    expect(
      (
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM beauty.support_requests WHERE id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
  }));
it("shows overdue hold reviews for unresolved general cases without deleting or exposing the justification", () =>
  isolated(async (tx) => {
    const id = await ticket(tx, "Booking");
    await tx.query(
      "UPDATE beauty.support_requests SET retention_hold_reason='Evidence needed for active dispute',next_review_at=current_date WHERE id=$1",
      [id],
    );
    const queue = (
      await as(tx, "privacy-owner", () =>
        tx.query<{
          data: { items: { id: string; onHold: boolean; reviewAt: string }[] };
        }>("SELECT beauty.owner_support_operations(NULL) AS data"),
      )
    ).rows[0].data;
    const row = queue.items.find((row) => row.id === id);
    expect(row?.onHold).toBe(true);
    expect(row?.reviewAt).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain("Evidence needed");
  }));
