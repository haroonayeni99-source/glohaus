import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type {
  ProfessionalSelection,
  ServiceOptionInput,
  TaxonomyCatalog,
  TaxonomyQuote,
} from "./domain";
export async function taxonomyCatalog(db: SqlClient, includeInactive = false) {
  return (
    await db.query<{ data: TaxonomyCatalog }>(
      "SELECT beauty.taxonomy_catalog($1) AS data",
      [includeInactive],
    )
  ).rows[0].data;
}
export async function mySelection(db: SqlClient) {
  return (
    await db.query<{ data: ProfessionalSelection }>(
      "SELECT beauty.my_speciality_selection() AS data",
    )
  ).rows[0].data;
}
export async function serviceOptions(db: SqlClient, professionalId: string) {
  return (
    await db.query<{
      service_id: string;
      id: string;
      kind: "variation" | "extra";
      name: string;
      pricePence: number;
      durationMinutes: number;
      active: boolean;
      sortOrder: number;
      attributes: Record<string, string>;
    }>(
      `SELECT o.service_id,o.id,o.kind,o.name,o.price_pence AS "pricePence",o.duration_minutes AS "durationMinutes",o.active,o.sort_order AS "sortOrder",o.attributes FROM beauty.service_options o JOIN beauty.services s ON s.id=o.service_id WHERE s.professional_id=$1 ORDER BY o.sort_order,o.id`,
      [professionalId],
    )
  ).rows;
}
export async function saveOptions(
  db: SqlClient,
  id: string,
  variations: ServiceOptionInput[],
  extras: ServiceOptionInput[],
) {
  await db.query(
    "SELECT beauty.save_my_service_options($1,$2::jsonb,$3::jsonb)",
    [id, JSON.stringify(variations), JSON.stringify(extras)],
  );
}
export async function serviceQuote(
  db: SqlClient,
  id: string,
  variationId?: string | null,
  extraIds: string[] = [],
) {
  return (
    await db.query<{ data: TaxonomyQuote }>(
      "SELECT beauty.service_quote($1,$2,$3) AS data",
      [id, variationId ?? null, extraIds],
    )
  ).rows[0].data;
}
