import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import { storyInputSchema, type StoryInput } from "./domain";

export async function createStory(
  db: SqlClient,
  professionalId: string,
  input: StoryInput,
) {
  const parsed = storyInputSchema.parse(input);
  const asset = (
    await db.query<{ id: string }>(
      `SELECT id
       FROM beauty.portfolio_assets
       WHERE id=$1
         AND professional_id=$2
         AND publication_status='published'`,
      [parsed.assetId, professionalId],
    )
  ).rows[0];
  if (!asset) throw new AccessError("FORBIDDEN", 403);

  if (parsed.serviceId) {
    const service = (
      await db.query<{ id: string }>(
        `SELECT id
         FROM beauty.services
         WHERE id=$1 AND professional_id=$2 AND active=true`,
        [parsed.serviceId, professionalId],
      )
    ).rows[0];
    if (!service) throw new AccessError("FORBIDDEN", 403);
  }

  const result = await db.query<{ id: string }>(
    `INSERT INTO beauty.professional_stories
      (professional_id,asset_id,service_id,caption)
     VALUES($1,$2,$3,$4)
     RETURNING id`,
    [professionalId, parsed.assetId, parsed.serviceId, parsed.caption],
  );
  return result.rows[0];
}

export async function removeStory(
  db: SqlClient,
  professionalId: string,
  id: string,
) {
  const result = await db.query(
    `DELETE FROM beauty.professional_stories
     WHERE id=$1 AND professional_id=$2
     RETURNING id`,
    [id, professionalId],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
}
