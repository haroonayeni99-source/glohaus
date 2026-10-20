"use server";
import { redirect } from "next/navigation";
import { withOwner } from "@/modules/admin/repository";

// A stored planning configuration. No Stripe, wallet, credit, payout or commission code reads it.
export async function saveRewardDraft(formData: FormData) {
  const amount = Number(formData.get("customerCreditPence"));
  const waiver = Number(formData.get("professionalWaiverDays"));
  const minBookings = Number(formData.get("minimumBookings"));
  const valid = [amount, waiver, minBookings].every(Number.isSafeInteger)
    && amount >= 0 && amount <= 1000
    && waiver >= 0 && waiver <= 30
    && minBookings >= 1 && minBookings <= 5;
  if (!valid) redirect("/admin/growth?rewardDraft=invalid");
  const data = JSON.stringify({
    enabled: false,
    customerCreditPence: amount,
    professionalWaiverDays: waiver,
    minimumCompletedBookings: minBookings,
    qualification: "first_completed_paid_booking",
    status: "draft",
    version: 1,
  });
  const ok = await withOwner(async db => {
    await db.query(
      `INSERT INTO beauty.platform_settings(key,value,updated_at)
       VALUES('referral_rewards_draft',$1::jsonb,NOW())
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
      [data],
    );
    return true;
  }).catch(() => false);
  redirect(ok ? "/admin/growth?rewardDraft=saved" : "/admin/growth?rewardDraft=unavailable");
}
