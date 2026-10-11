import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import { publicLocationSchema, type PublicLocation } from "./location";
import type { z } from "zod";

export async function ownPublicLocation(db: SqlClient, id: string) {
  return (
    (
      await db.query<PublicLocation>(
        "SELECT latitude,longitude,source,confirmed_at FROM beauty.professional_public_locations WHERE professional_id=$1 AND confirmed_at IS NOT NULL",
        [id],
      )
    ).rows[0] ?? null
  );
}
export async function savePublicLocation(
  db: SqlClient,
  id: string,
  input: z.infer<typeof publicLocationSchema>,
) {
  const point = publicLocationSchema.parse(input);
  // RLS enforces ownership on both insertion and conflict update.
  const result = await db.query(
    `INSERT INTO beauty.professional_public_locations(professional_id,latitude,longitude,source,confirmed_at)
     VALUES ($1,$2,$3,$4,CASE WHEN $5::boolean THEN now() ELSE NULL END)
     ON CONFLICT(professional_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,source=excluded.source,confirmed_at=excluded.confirmed_at
     RETURNING professional_id`,
    [
      id,
      point.confirmed ? point.latitude : null,
      point.confirmed ? point.longitude : null,
      point.confirmed ? point.source : null,
      point.confirmed,
    ],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
}
