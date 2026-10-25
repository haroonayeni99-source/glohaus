"use server";
import { redirect } from "next/navigation";
import { withOwner } from "@/modules/admin/repository";
export async function refreshGrowthAudit() {
  const ok = await withOwner(async (db) => {
    await db.query("SELECT beauty.owner_refresh_booking_attribution()");
    await db.query("SELECT beauty.owner_refresh_referral_audit()");
    return true;
  }).catch(() => false);
  redirect("/admin/growth/review?refresh=" + (ok ? "success" : "unavailable"));
}
export async function nominateProfessional(form: FormData) {
  const id = String(form.get("professionalId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const gift = String(form.get("gift") ?? "").trim();
  const pence = Number(form.get("amountPence"));
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    reason.length < 10 ||
    reason.length > 1000 ||
    gift.length > 500 ||
    !Number.isSafeInteger(pence) ||
    pence < 0 ||
    pence > 10000000
  )
    redirect("/admin/growth/review?nomination=invalid");
  const ok = await withOwner(async (db) => {
    await db.query("SELECT beauty.owner_nominate_appreciation($1,$2,$3,$4)", [
      id,
      reason,
      gift,
      pence,
    ]);
    return true;
  }).catch(() => false);
  redirect("/admin/growth/review?nomination=" + (ok ? "saved" : "unavailable"));
}

export async function detectReferralRisks() {
  const ok = await withOwner(
    async (db) =>
      (await db.query("SELECT beauty.owner_detect_referral_risks()")).rows
        .length >= 0,
  ).catch(() => false);
  redirect("/admin/growth/review?risks=" + (ok ? "checked" : "unavailable"));
}
export async function decideReferralReview(form: FormData) {
  const id = String(form.get("caseId") ?? "");
  const status = String(form.get("decision") ?? "");
  const notes = String(form.get("notes") ?? "").trim();
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !["under_review", "cleared", "rejected"].includes(status) ||
    notes.length < 10 ||
    notes.length > 1500
  )
    redirect("/admin/growth/review?case=invalid");
  const ok = await withOwner(
    async (db) =>
      (
        await db.query<{ ok: boolean }>(
          "SELECT beauty.owner_decide_referral_review($1,$2,$3) AS ok",
          [id, status, notes],
        )
      ).rows[0]?.ok === true,
  ).catch(() => false);
  redirect("/admin/growth/review?case=" + (ok ? "saved" : "unavailable"));
}

export async function transitionAppreciation(form: FormData) {
  const id = String(form.get("id") ?? "");
  const state = String(form.get("state") ?? "");
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !["approved", "cancelled", "fulfilled"].includes(state)
  )
    redirect("/admin/growth/review?appreciation=invalid");
  const success = await withOwner(
    async (db) =>
      (
        await db.query<{ result: boolean }>(
          "SELECT beauty.owner_transition_appreciation($1,$2) AS result",
          [id, state],
        )
      ).rows[0]?.result === true,
  ).catch(() => false);
  redirect(
    "/admin/growth/review?appreciation=" + (success ? "saved" : "unavailable"),
  );
}

export async function resolveCustomerSource(form: FormData) {
  const customer = String(form.get("customerId") ?? "");
  const professional = String(form.get("professionalId") ?? "");
  const source = String(form.get("source") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (
    !/^[a-f0-9-]{36}$/.test(customer) ||
    !/^[a-f0-9-]{36}$/.test(professional) ||
    ![
      "existing_professional",
      "new_professional",
      "glohaus",
      "unknown",
    ].includes(source) ||
    reason.length < 10 ||
    reason.length > 1000
  )
    redirect("/admin/growth/review?source=invalid");
  const ok = await withOwner(async (db) => {
    await db.query("SELECT beauty.owner_resolve_acquisition($1,$2,$3,$4)", [
      customer,
      professional,
      source,
      reason,
    ]);
    return true;
  }).catch(() => false);
  redirect("/admin/growth/review?source=" + (ok ? "saved" : "unavailable"));
}
