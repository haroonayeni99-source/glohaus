import { z } from "zod";
const cursorSchema = z
  .object({
    name: z.string().min(2).max(100),
    id: z.uuid(),
    query: z.string().max(100),
  })
  .strict();
export type DiscoveryCursor = z.infer<typeof cursorSchema>;
export function discoveryOptions(params: {
  q?: string | string[];
  after?: string | string[];
}) {
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  let after: DiscoveryCursor | undefined;
  if (typeof params.after === "string" && params.after.length <= 1400) {
    try {
      const parsed = cursorSchema.safeParse(
        JSON.parse(Buffer.from(params.after, "base64url").toString("utf8")),
      );
      if (parsed.success && parsed.data.query === query) after = parsed.data;
    } catch {}
  }
  return { query, after };
}
export function discoveryCursor(
  row: { id: string; business_name: string },
  query: string,
) {
  return Buffer.from(
    JSON.stringify({ id: row.id, name: row.business_name, query }),
  ).toString("base64url");
}
