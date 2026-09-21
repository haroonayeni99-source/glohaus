import { z } from "zod";
export const bookingViews = ["upcoming", "history", "all"] as const;
export type BookingView = (typeof bookingViews)[number];
const cursorSchema = z
  .object({ startsAt: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
export type BookingCursor = z.infer<typeof cursorSchema>;
export function bookingListOptions(params: {
  view?: string | string[];
  after?: string | string[];
}) {
  const view: BookingView = bookingViews.includes(params.view as BookingView)
    ? (params.view as BookingView)
    : "upcoming";
  let after: BookingCursor | undefined;
  if (typeof params.after === "string" && params.after.length <= 400) {
    try {
      const parsed = cursorSchema.safeParse(
        JSON.parse(Buffer.from(params.after, "base64url").toString("utf8")),
      );
      if (parsed.success) after = parsed.data;
    } catch {}
  }
  return { view, after };
}
export function bookingCursor(row: { id: string; starts_at: Date }) {
  return Buffer.from(
    JSON.stringify({
      id: row.id,
      startsAt: new Date(row.starts_at).toISOString(),
    }),
  ).toString("base64url");
}
