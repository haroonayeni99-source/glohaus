import { z } from "zod";

const messageCursorSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type MessageCursor = z.infer<typeof messageCursorSchema>;

export function parseMessageCursor(raw: string | null): MessageCursor | undefined {
  if (raw === null) return undefined;
  if (raw.length > 400) throw new Error("INVALID_CURSOR");
  try {
    return messageCursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export function encodeMessageCursor(cursor: MessageCursor) {
  return Buffer.from(
    JSON.stringify(messageCursorSchema.parse(cursor)),
  ).toString("base64url");
}
