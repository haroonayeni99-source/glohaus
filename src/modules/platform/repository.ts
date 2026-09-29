import "server-only";
import { withIdentity } from "@/lib/db";
import { defaultLabels, type Labels } from "./domain";
import type { SqlClient } from "@/modules/accounts/repository";
export async function publicLabels(): Promise<Labels> {
  if (!process.env.DATABASE_URL) return defaultLabels;
  try {
    return await withIdentity("", async (db) => ({
      ...defaultLabels,
      ...Object.fromEntries(
        (
          await db.query<{ key: string; label: string }>(
            "SELECT key,label FROM beauty.platform_labels",
          )
        ).rows.map((row) => [row.key, row.label]),
      ),
    }));
  } catch {
    return defaultLabels;
  }
}


export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export async function publicCategories(): Promise<PublicCategory[]> {
  if (!process.env.DATABASE_URL)
    return [
      { id: "hair", name: "Hair", slug: "hair", sort_order: 10 },
      { id: "nails", name: "Nails", slug: "nails", sort_order: 20 },
      { id: "makeup", name: "Makeup", slug: "makeup", sort_order: 30 },
      { id: "lashes-brows", name: "Lashes & brows", slug: "lashes-brows", sort_order: 40 },
      { id: "skin", name: "Skin", slug: "skin", sort_order: 50 },
    ];
  try {
    return await withIdentity("", async (db) =>
      (
        await db.query<PublicCategory>(
          "SELECT id,name,slug,sort_order FROM beauty.platform_categories WHERE active ORDER BY sort_order,name",
        )
      ).rows,
    );
  } catch {
    return [];
  }
}

export async function categoryIsActive(
  db: SqlClient,
  name: string,
) {
  const row = (
    await db.query<{ ok: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM beauty.platform_categories WHERE active AND name=$1) AS ok",
      [name],
    )
  ).rows[0];
  return Boolean(row?.ok);
}
