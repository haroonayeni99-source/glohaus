import "server-only";
import { withIdentity } from "@/lib/db";
import { defaultLabels, type Labels } from "./domain";
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
