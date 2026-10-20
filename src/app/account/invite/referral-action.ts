"use server";
import { redirect } from "next/navigation";
import { withAccount } from "@/lib/api-account";

export async function claimReferral(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^GC[A-F0-9]{16}$/.test(code)) redirect("/account/invite?claim=unavailable");
  const claimed = await withAccount("customer", async (db) => {
    return (await db.query<{ success: boolean }>(
      "SELECT beauty.claim_customer_referral($1) AS success", [code],
    )).rows[0]?.success === true;
  }).catch(() => false);
  redirect(claimed ? "/account/invite?claim=success" : "/account/invite?claim=unavailable");
}
