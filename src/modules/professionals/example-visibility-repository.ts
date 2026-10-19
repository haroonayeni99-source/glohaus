import "server-only";
import { cache } from "react";
import { withIdentity } from "@/lib/db";
import type { SqlClient } from "@/modules/accounts/repository";
import {
  defaultExampleVisibility,
  exampleVisibilitySchema,
  type ExampleVisibility,
} from "./example-visibility";

export async function readExampleVisibility(
  db: SqlClient,
): Promise<ExampleVisibility> {
  const row = (
    await db.query<{ value: unknown }>(
      "SELECT value FROM beauty.platform_settings WHERE key='profile_examples'",
    )
  ).rows[0];
  return row
    ? exampleVisibilitySchema.parse(row.value)
    : defaultExampleVisibility;
}
export const publicExampleVisibility = cache(
  async (): Promise<ExampleVisibility> => {
    // Preserve the credential-free local example gallery. Configured database
    // failures hide examples rather than undoing an Owner's saved decision.
    if (!process.env.DATABASE_URL) return defaultExampleVisibility;
    try {
      return await withIdentity("", readExampleVisibility);
    } catch {
      return { enabled: false, hiddenSlugs: [] };
    }
  },
);
