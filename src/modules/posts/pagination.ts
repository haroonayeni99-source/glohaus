import { z } from "zod";
const cursorSchema = z
  .object({ id: z.uuid(), createdAt: z.iso.datetime() })
  .strict();
export type PostCursor = z.infer<typeof cursorSchema>;
export function parsePostCursor(raw: string | null): PostCursor | undefined {
  if (raw === null) return undefined;
  if (raw.length > 400) throw new Error("INVALID_CURSOR");
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
export function encodePostCursor(cursor: PostCursor) {
  return Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString(
    "base64url",
  );
}
