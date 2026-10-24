"use server";
import { withAccount } from "@/lib/api-account";
import { redirect } from "next/navigation";
export async function acceptInvitation(form: FormData) {
  const token = String(form.get("token") ?? "");
  const medium = form.get("medium") === "qr" ? "qr" : "link";
  if (!/^[a-f0-9]{32}$/.test(token) || form.get("consent") !== "yes") return;
  let slug: string | undefined;
  try {
    slug = await withAccount(
      "customer",
      async (db) =>
        (
          await db.query<{ slug: string }>(
            "SELECT beauty.accept_acquisition_invitation($1,$2) AS slug",
            [token, medium],
          )
        ).rows[0]?.slug,
    );
  } catch {}
  redirect(slug ? `/p/${slug}` : `/i/${token}?result=unavailable`);
}
